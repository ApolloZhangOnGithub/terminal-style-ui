#!/usr/bin/python3
# tsu-preview.py —— Nautilus 空格预览（Terminal Style UI 的 Linux 版「快速查看」）
# Nautilus 里选中文件按空格 → Nautilus 经 D-Bus 调 org.gnome.NautilusPreviewer（GNOME 预览器 Sushi 用的同一个名字，
# install.sh 把本程序登记成它）→ 读文件 → WebKitGTK 加载与 Mac 快速查看同一份 shell.html（内含 ttu-core.js，终端渲染管线
# 打包版）→ 页面按窗口宽度流式渲染：第一块出来就显示窗口，其余陆续追加；拉宽自动重排。输出与 VSCode 插件 / Mac 快速查看一致。
# Markdown 照常渲染，代码 / 文本带高亮与行号（类型由 ttu-core 按内容判断）；图片直接显示；文件夹、二进制等显示信息卡片。
#   空格 / Esc 关闭；方向键交给 Nautilus 换文件（同访达）；Ctrl+= / Ctrl+- / Ctrl+0、Ctrl+滚轮 缩放
#   字体、字号跟随系统等宽字体（终端默认也用它），深浅色跟随系统
#   tsu-preview.py 文件…    命令行直接预览（不经 Nautilus，方向键用来滚动）
# 只依赖系统 Python 的 GTK3 + WebKitGTK 4.1（Ubuntu：python3-gi gir1.2-webkit2-4.1），预览时不需要 Node
import base64
import ctypes
import html
import json
import os
import sys
import threading

import gi

gi.require_version("Gdk", "3.0")
gi.require_version("GdkPixbuf", "2.0")
gi.require_version("Gtk", "3.0")
gi.require_version("Pango", "1.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib  # noqa: E402

APP_ID = "com.apollozhang.TerminalStyleUI.Preview"
# 先于 GTK 初始化设好：Wayland 下窗口的应用 ID 取它，GNOME Shell 据此找到桌面文件（任务切换里的图标、名字）
GLib.set_prgname(APP_ID)
GLib.set_application_name("Terminal Style UI")

from gi.repository import Gdk, GdkPixbuf, Gio, Gtk, Pango, WebKit2  # noqa: E402

PREVIEWER_NAME = "org.gnome.NautilusPreviewer"
PREVIEWER_PATH = "/org/gnome/NautilusPreviewer"
PREVIEWER2 = "org.gnome.NautilusPreviewer2"
RESOURCES = os.path.dirname(os.path.realpath(__file__))  # shell.html、ttu-core.js、terminal.css 与本文件放在一起（install.sh）
STATE_FILE = os.path.join(GLib.get_user_state_dir(), "terminal-style-ui", "nautilus-preview.json")  # 窗口大小、缩放
MAX_BYTES = 8 << 20  # 超过只显示开头（同 Mac）
LINGER_MS = 5 * 60 * 1000  # 服务模式：关掉预览后进程再留 5 分钟，下次按空格立即弹出；之后退出，D-Bus 按需再拉起
ZOOM_STEPS = (0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0)
NOT_TEXT = ("video/", "audio/", "font/", "application/pdf")  # 不读内容，直接显示信息卡片
ATTRS = "standard::display-name,standard::content-type,standard::size,standard::type,standard::icon,time::modified"
DEBUG = bool(os.environ.get("TSU_PREVIEW_DEBUG"))  # 打开网页检查器、把页面控制台输出打到 stdout

# Nautilus 调的接口（同 Sushi 的 data/org.gnome.NautilusPreviewer2.xml）：v2 传窗口句柄字符串（wayland:… / x11:…）和
# xdg-activation 令牌（Nautilus 50 按 (ssbs) 调，参数个数不符 D-Bus 直接拒收）；旧版 v1 传 X11 窗口号（Ubuntu 桌面图标 DING 用它）
INTERFACES = """<node>
  <interface name="org.gnome.NautilusPreviewer2">
    <method name="ShowFile">
      <arg type="s" name="uri" direction="in"/>
      <arg type="s" name="windowHandle" direction="in"/>
      <arg type="b" name="closeIfAlreadyShown" direction="in"/>
      <arg type="s" name="activationToken" direction="in"/>
    </method>
    <method name="Close"/>
    <property name="ParentHandle" type="s" access="read"/>
    <property name="Visible" type="b" access="read"/>
    <signal name="SelectionEvent"><arg type="u" name="direction"/></signal>
  </interface>
  <interface name="org.gnome.NautilusPreviewer">
    <method name="ShowFile">
      <arg type="s" name="uri" direction="in"/>
      <arg type="i" name="xid" direction="in"/>
      <arg type="b" name="closeIfShown" direction="in"/>
    </method>
    <method name="Close"/>
  </interface>
</node>"""

# 预览窗口里的方向键 → 告诉 Nautilus 往哪个方向换文件（GtkDirectionType，Nautilus 移动选择后再调 ShowFile）
ARROWS = {
    Gdk.KEY_Up: Gtk.DirectionType.UP,
    Gdk.KEY_Down: Gtk.DirectionType.DOWN,
    Gdk.KEY_Left: Gtk.DirectionType.LEFT,
    Gdk.KEY_Right: Gtk.DirectionType.RIGHT,
}
# 右键菜单只留复制类（后退 / 重新载入之类会丢掉内容）
MENU_KEEP = {
    WebKit2.ContextMenuAction.COPY,
    WebKit2.ContextMenuAction.SELECT_ALL,
    WebKit2.ContextMenuAction.COPY_LINK_TO_CLIPBOARD,
    WebKit2.ContextMenuAction.COPY_IMAGE_TO_CLIPBOARD,
    WebKit2.ContextMenuAction.COPY_IMAGE_URL_TO_CLIPBOARD,
}


def log(*args):
    print("tsu-preview:", *args, file=sys.stderr, flush=True)


# ── 读文件（后台线程）──


def read_head(file, limit, binary_check=False):
    """读开头最多 limit 字节（本地、sftp、smb、回收站……GIO 能读的都行）；binary_check：第一块就含 NUL 时不往下读，返回 None"""
    stream = file.read(None)
    try:
        chunks, size = [], 0
        while size < limit:
            data = stream.read_bytes(min(1 << 20, limit - size), None).get_data()
            if not data:
                break
            if binary_check and not chunks and b"\0" in data[:8000] and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
                return None  # 二进制（UTF-16 文本也含 NUL，带 BOM 的放过）
            chunks.append(data)
            size += len(data)
        return b"".join(chunks)
    finally:
        stream.close(None)


def decode(data, truncated):
    """UTF-8 优先；不是合法 UTF-8 时按 UTF-16（带 BOM）/ GB18030 / 有损 UTF-8 依次试（同 Mac）"""
    for cut in range(4 if truncated else 1):  # 截断处可能切开一个多字节字符：去掉末尾 1–3 字节再试
        try:
            return data[: len(data) - cut].decode("utf-8-sig")
        except UnicodeDecodeError:
            pass
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return data[: len(data) & ~1].decode("utf-16")
        except UnicodeDecodeError:
            pass
    try:
        return data.decode("gb18030")
    except UnicodeDecodeError:
        return data.decode("utf-8", errors="replace")


def count_children(file, cap=10000):
    try:
        entries = file.enumerate_children("standard::name", Gio.FileQueryInfoFlags.NONE, None)
        n = 0
        while n < cap and entries.next_file(None):
            n += 1
        entries.close(None)
        return n
    except GLib.Error:
        return None


def load(file):
    """查文件信息、读内容 → 交给主线程显示的 dict（kind：text / image / card）"""
    info = file.query_info(ATTRS, Gio.FileQueryInfoFlags.NONE, None)
    ctype = info.get_content_type() or "application/octet-stream"
    item = {
        "file": file,
        "name": info.get_display_name(),
        "type": ctype,
        "desc": Gio.content_type_get_description(ctype),
        "size": info.get_size(),
        "icon": info.get_icon(),
        "mtime": info.get_modification_date_time(),
        "kind": "card",
    }
    path = file.get_path()
    if info.get_file_type() == Gio.FileType.DIRECTORY:
        item["count"] = count_children(file)
    elif ctype.startswith("image/"):
        item["kind"] = "image"
        if path:
            item["src"] = GLib.filename_to_uri(path, None)
            fmt, width, height = GdkPixbuf.Pixbuf.get_file_info(path)
            if fmt:
                item["dims"] = (width, height)
        else:  # 远程文件：内嵌成 data URI
            item["src"] = f"data:{ctype};base64," + base64.b64encode(read_head(file, MAX_BYTES)).decode()
    elif not ctype.startswith(NOT_TEXT):
        data = read_head(file, MAX_BYTES + 1, binary_check=True)
        if data is not None:
            truncated = len(data) > MAX_BYTES
            text = decode(data[:MAX_BYTES], truncated)
            if "\0" not in text[:8000]:  # 同 ttu-core 的 detectFile：解码后仍含 NUL 即二进制
                note = f"文件较大，只显示开头 {MAX_BYTES >> 20} MB" if truncated else ""
                item.update(kind="text", text=text, note=note)
    return item


# ── 页面 ──


def subtitle(item):
    if item.get("error"):
        return item["error"]
    parts = [item["desc"]]
    if "dims" in item:
        parts.append("%d × %d" % item["dims"])
    if "count" in item:
        parts.append("" if item["count"] is None else f"{item['count']} 项")
    else:
        parts.append(GLib.format_size(item["size"]))
    return " · ".join(p for p in parts if p)


def image_page(item, dark, gen):
    bg = "#000" if dark else "#fff"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html, body {{ margin: 0; height: 100%; background: {bg}; }}
body {{ display: flex; align-items: center; justify-content: center; }}
img {{ max-width: 100%; max-height: 100%; object-fit: contain; }}
</style></head><body><img src="{html.escape(item["src"])}" alt=""
onerror="webkit.messageHandlers.tmd.postMessage('binary:{gen}')"></body></html>"""


def card_page(item, dark, icon, font):
    """文件夹、二进制、读不了的文件：图标 + 名字 + 类型 / 大小 / 修改时间"""
    fg, dim, bg = ("#c7c7c7", "#808080", "#000") if dark else ("#1a1a1a", "#6e6e6e", "#fff")
    lines = [subtitle(item)]
    if item.get("mtime"):
        lines.append("修改于 " + item["mtime"].to_local().format("%Y-%m-%d %H:%M"))
    img = f'<img src="{html.escape(icon)}" alt="">' if icon else ""
    meta = "".join(f'<div class="meta">{html.escape(s)}</div>' for s in lines if s)
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html, body {{ margin: 0; height: 100%; background: {bg}; color: {fg}; font: {font[1]:.2f}px "{font[0]}", monospace; }}
body {{ display: flex; align-items: center; justify-content: center; text-align: center; }}
img {{ width: 128px; height: 128px; }}
.name {{ margin: 12px 24px 6px; font-weight: bold; word-break: break-all; }}
.meta {{ margin: 2px 24px; color: {dim}; }}
</style></head><body><div>{img}<div class="name">{html.escape(item["name"])}</div>{meta}</div></body></html>"""


# ── 窗口状态（大小、缩放）──


def load_state():
    try:
        with open(STATE_FILE) as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def screen_default_size():
    """默认窗口大小：屏幕工作区的 60% × 80%（1920×1080 上 1152×864）"""
    display = Gdk.Display.get_default()
    monitor = display.get_primary_monitor() or display.get_monitor(0)
    if monitor is None:
        return 900, 700
    area = monitor.get_workarea()
    return max(640, area.width * 3 // 5), max(480, area.height * 4 // 5)


# GTK3 的 Wayland 专用函数没进 GObject 内省（没有 GdkWayland-3.0），经 ctypes 调；拿不到就当普通窗口：
#   gdk_wayland_window_set_transient_for_exported：让预览窗口成为 Nautilus 窗口的子窗口（同 Sushi）
#   gdk_wayland_display_set_startup_notification_id：交给 GTK 的激活令牌，下一次 gdk_window_focus 用它激活窗口
try:
    _gdk = ctypes.CDLL("libgdk-3.so.0")
    _gdk.gdk_wayland_window_set_transient_for_exported.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    _gdk.gdk_wayland_window_set_transient_for_exported.restype = ctypes.c_bool
    _gdk.gdk_wayland_display_set_startup_notification_id.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    _gdk.gdk_wayland_display_set_startup_notification_id.restype = None
    _gdk.gdk_window_set_transient_for.argtypes = [ctypes.c_void_p, ctypes.c_void_p]  # 传 NULL 解除（内省里 parent 不可为空）
    _gdk.gdk_window_set_transient_for.restype = None
    ctypes.pythonapi.PyCapsule_GetPointer.restype = ctypes.c_void_p
    ctypes.pythonapi.PyCapsule_GetPointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
except (OSError, AttributeError):
    _gdk = None


def c_pointer(gobject):
    return ctypes.pythonapi.PyCapsule_GetPointer(gobject.__gpointer__, None)


def activate_window(gdk_window, token):
    """用 Nautilus 传来的 xdg-activation 令牌把窗口提到前面、给焦点。没有令牌时 GNOME 会把激活当成抢焦点，只弹「已就绪」通知"""
    try:
        if _gdk and gdk_window.__gtype__.name == "GdkWaylandWindow":
            _gdk.gdk_wayland_display_set_startup_notification_id(c_pointer(gdk_window.get_display()), token.encode())
            gdk_window.focus(Gdk.CURRENT_TIME)
    except Exception as e:  # noqa: BLE001 —— 激活不了不影响预览
        log("激活窗口失败：", e)


def clear_transient_for(gdk_window):
    if _gdk:
        _gdk.gdk_window_set_transient_for(c_pointer(gdk_window), None)


def set_transient_for_handle(gdk_window, handle):
    kind, _, value = handle.partition(":")
    if not value:
        return
    try:
        if kind == "wayland" and _gdk and gdk_window.__gtype__.name == "GdkWaylandWindow":
            if not _gdk.gdk_wayland_window_set_transient_for_exported(c_pointer(gdk_window), value.encode()):
                log("挂到 Nautilus 窗口失败：", handle)
        elif kind == "x11" and gdk_window.__gtype__.name == "GdkX11Window":
            gi.require_version("GdkX11", "3.0")
            from gi.repository import GdkX11

            parent = GdkX11.X11Window.foreign_new_for_display(gdk_window.get_display(), int(value, 16))
            if parent:
                gdk_window.set_transient_for(parent)
    except Exception as e:  # noqa: BLE001 —— 挂不上不影响预览
        log("挂到 Nautilus 窗口失败：", handle, e)


class Previewer(Gtk.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.HANDLES_OPEN)
        self.win = self.view = self.bus = self.desktop = None
        self.file = None  # 最近一次要求显示的文件（空格再按一次同一个文件 = 关闭）
        self.item = None  # 正在显示的文件（load() 的结果）
        self.gen = 0  # 每次换文件 / 关闭加一：慢的读取、页面消息回来时已经换了文件就丢弃
        self.rendering = None  # 最近一次 tmdStart 属于哪一代（shell.html 的 first / binary 消息不带编号）
        self.visible = False  # D-Bus 属性 Visible：预览开着时 Nautilus 在选择变化后自动换预览
        self.parent_handle = ""  # D-Bus 属性 ParentHandle：预览挂在哪个 Nautilus 窗口上
        self.token = ""  # 用户在 Nautilus 里按空格时带来的激活令牌，显示时用掉
        self.held = False
        self.arrows_to_nautilus = False
        self.zoom_acc = 0.0
        self.registrations = []
        self.name_id = 0
        self.state = load_state()
        self.attach_to = ""  # 这次显示要挂到的 Nautilus 窗口句柄（命令行打开时为空）
        self.default_size = None  # 按屏幕算的默认大小；用户拖过的大小才记进 state
        self.center_on_screen = False  # mutter 开着「新窗口居中」：先居中显示，再挂到 Nautilus 窗口上

    # ── GApplication ──

    def do_startup(self):
        Gtk.Application.do_startup(self)
        quit_action = Gio.SimpleAction.new("quit", None)  # install.sh 重装时让旧版退出
        quit_action.connect("activate", lambda *_: self.quit())
        self.add_action(quit_action)
        if self.get_flags() & Gio.ApplicationFlags.IS_SERVICE:
            self.set_inactivity_timeout(LINGER_MS)
        source = Gio.SettingsSchemaSource.get_default()
        if source and source.lookup("org.gnome.desktop.interface", True):
            self.desktop = Gio.Settings.new("org.gnome.desktop.interface")
            self.desktop.connect("changed", self.on_desktop_changed)
        mutter = source.lookup("org.gnome.mutter", True) if source else None
        if mutter and mutter.has_key("center-new-windows"):
            self.center_on_screen = Gio.Settings.new("org.gnome.mutter").get_boolean("center-new-windows")

    def do_dbus_register(self, connection, object_path):
        Gtk.Application.do_dbus_register(self, connection, object_path)
        register = getattr(connection, "register_object_with_closures2", None) or connection.register_object
        for iface in Gio.DBusNodeInfo.new_for_xml(INTERFACES).interfaces:
            self.registrations.append(register(PREVIEWER_PATH, iface, self.on_call, self.on_get_property, None))
        self.bus = connection
        # 先挂好对象再占名字：D-Bus 激活时，Nautilus 那次调用在拿到名字后立刻送达
        self.name_id = Gio.bus_own_name_on_connection(connection, PREVIEWER_NAME, Gio.BusNameOwnerFlags.NONE, None, None)
        return True

    def do_dbus_unregister(self, connection, object_path):
        if self.name_id:
            Gio.bus_unown_name(self.name_id)
            self.name_id = 0
        for registration in self.registrations:
            connection.unregister_object(registration)
        self.registrations = []
        Gtk.Application.do_dbus_unregister(self, connection, object_path)

    def do_activate(self):
        pass  # 没给文件：没什么可显示

    def do_open(self, files, n_files, hint):
        self.show_file(files[0], "", False, "", from_nautilus=False)

    # ── D-Bus：org.gnome.NautilusPreviewer2 ──

    def on_call(self, connection, sender, path, iface, method, params, invocation):
        if method == "ShowFile":
            if iface == PREVIEWER2:
                uri, handle, toggle, token = params.unpack()
            else:  # 旧接口 v1：第二个参数是 X11 窗口号，没有激活令牌
                uri, xid, toggle = params.unpack()
                handle, token = (f"x11:{xid:x}" if xid else ""), ""
            invocation.return_value(None)
            self.show_file(Gio.File.new_for_uri(uri), handle, toggle, token, from_nautilus=True)
        elif method == "Close":
            invocation.return_value(None)
            self.hide_preview()
        else:
            invocation.return_dbus_error("org.freedesktop.DBus.Error.UnknownMethod", method)

    def on_get_property(self, connection, sender, path, iface, prop):
        if prop == "Visible":
            return GLib.Variant("b", self.visible)
        if prop == "ParentHandle":
            return GLib.Variant("s", self.parent_handle)
        return None

    def publish(self, **changes):
        """更新 D-Bus 属性（visible / parent_handle），有变化就发 PropertiesChanged（Nautilus 读的是缓存的属性值）"""
        changed = {}
        for attr, value in changes.items():
            if getattr(self, attr) != value:
                setattr(self, attr, value)
                name = "Visible" if attr == "visible" else "ParentHandle"
                changed[name] = GLib.Variant("b" if attr == "visible" else "s", value)
        if changed and self.bus:
            signal = GLib.Variant("(sa{sv}as)", (PREVIEWER2, changed, []))
            self.bus.emit_signal(None, PREVIEWER_PATH, "org.freedesktop.DBus.Properties", "PropertiesChanged", signal)

    def select_neighbor(self, direction):
        if self.bus:
            self.bus.emit_signal(None, PREVIEWER_PATH, PREVIEWER2, "SelectionEvent", GLib.Variant("(u)", (int(direction),)))

    # ── 显示 / 关闭 ──

    def show_file(self, file, handle, toggle, token, from_nautilus):
        """toggle：用户在 Nautilus 里按了空格（同一个文件再按 = 关闭；换了文件就显示并提到前面）；
        否则是预览开着时 Nautilus 跟着选择换文件，只换内容、不抢焦点"""
        if toggle and self.visible and self.file and self.file.equal(file):
            self.hide_preview()
            return
        self.file = file
        self.arrows_to_nautilus = from_nautilus
        self.token = token if toggle else ""
        self.attach_to = handle
        if not self.held:  # 预览开着期间进程不退出
            self.held = True
            self.hold()
        self.ensure_window()
        if handle:
            self.publish(parent_handle=handle)
            # 挂到 Nautilus 窗口上，始终在它上面。但 mutter 放子窗口是对着父窗口的中线、往上偏三分之一，位置随 Nautilus 乱跑：
            # 开着「新窗口居中」时，没显示的窗口等 mutter 把它放到屏幕正中以后再挂（after_map）
            if self.win.get_visible() or not self.center_on_screen:
                set_transient_for_handle(self.win.get_window(), handle)
        self.gen += 1
        threading.Thread(target=self.load_in_background, args=(file, self.gen), daemon=True).start()

    def load_in_background(self, file, gen):
        try:
            item = load(file)
        except Exception as e:  # noqa: BLE001 —— 读不了（没权限、断网……）：卡片里写原因
            message = e.message if isinstance(e, GLib.Error) else str(e)
            item = {"file": file, "name": file.get_basename() or file.get_uri(), "kind": "card", "error": message}
        GLib.idle_add(self.on_loaded, gen, item)

    def on_loaded(self, gen, item):
        if gen == self.gen:
            self.item = item
            self.update_header()
            self.display()
        return False

    def display(self):
        """按当前主题与字体加载页面：文本 → shell.html（就绪后调 tmdStart）；图片 / 卡片 → 现成的 HTML"""
        item, gen, dark = self.item, self.gen, self.is_dark()
        theme = "dark" if dark else "light"
        self.view.set_background_color(Gdk.RGBA(*((0, 0, 0, 1) if dark else (1, 1, 1, 1))))  # 加载前就是对的底色，不闪
        Gtk.Settings.get_default().props.gtk_application_prefer_dark_theme = dark
        ucm, frames = self.view.get_user_content_manager(), WebKit2.UserContentInjectedFrames.TOP_FRAME
        ucm.remove_all_scripts()
        ucm.remove_all_style_sheets()
        # 首帧就用对的底色（shell.html 在页面脚本前读 __tmdTheme）；页面脚本跑完报「就绪」，带上这是第几代
        ucm.add_script(WebKit2.UserScript.new(f'window.__tmdTheme = "{theme}";', frames, WebKit2.UserScriptInjectionTime.START))
        ready = f'webkit.messageHandlers.tmd.postMessage("ready:{gen}");'
        ucm.add_script(WebKit2.UserScript.new(ready, frames, WebKit2.UserScriptInjectionTime.END))
        font = self.mono_font()
        if item["kind"] == "text":
            # 字体换成系统等宽字体（Mac 上是 Monaco / PingFang）；字号同它。格子宽 1ch 随字体自动算
            css = f'pre.terminal-style-ui {{ font-family: "{font[0]}", monospace !important; --ttu-font-size: {font[1]:.2f}px !important; }}'
            ucm.add_style_sheet(WebKit2.UserStyleSheet.new(css, frames, WebKit2.UserStyleLevel.USER))
            self.view.load_uri(GLib.filename_to_uri(os.path.join(RESOURCES, "shell.html"), None))
        elif item["kind"] == "image":
            self.view.load_html(image_page(item, dark, gen), "file:///")
        else:
            self.view.load_html(card_page(item, dark, self.icon_uri(item.get("icon")), font), "file:///")
        GLib.timeout_add(2000, self.reveal_late, gen)  # 兜底：页面出错没报「就绪」/ first 也照样显示窗口

    def on_message(self, manager, result):
        value = result.get_js_value() if hasattr(result, "get_js_value") else result
        kind, _, token = value.to_string().partition(":")
        gen = int(token) if token.isdigit() else self.rendering
        if gen != self.gen or not self.item:
            return  # 已经换了文件 / 关了
        if kind == "ready":
            if self.item["kind"] == "text":
                self.rendering = gen
                args = json.dumps([self.item["name"], self.item["text"], "dark" if self.is_dark() else "light", self.item["note"]], ensure_ascii=False)
                self.view.evaluate_javascript(f"tmdStart.apply(null, {args})", -1, None, None, None, None, None)
            else:
                self.reveal(gen)
        elif kind == "first":  # 第一块渲染出来了
            self.reveal(gen)
        elif kind == "binary":  # ttu-core 判为二进制 / 图片显示不了 → 信息卡片
            self.item["kind"] = "card"
            self.display()

    def reveal(self, gen):
        if gen != self.gen or not self.item:
            return
        if not self.win.get_visible():
            if self.center_on_screen:
                clear_transient_for(self.win.get_window())  # 上次挂的父窗口还在的话，mutter 会对着它放
            self.win.present()  # 新映射的窗口 GNOME 一般直接给焦点；没给的话 after_map 再用激活令牌补一次
            self.view.grab_focus()
            self.publish(visible=True)
        elif self.token:
            # 已显示（可能被 Nautilus 盖住了）又按了空格：用令牌提到前面。没有令牌不要 present——GNOME 会当成抢焦点，只弹「已就绪」通知
            activate_window(self.win.get_window(), self.token)
            self.token = ""
        self.snapshot()

    def on_map(self, win, event):
        GLib.timeout_add(150, self.after_map, self.token)  # 等窗口真正映射（交了第一帧，mutter 定好位置）
        self.token = ""
        return False

    def after_map(self, token):
        if not self.win.get_visible():
            return False
        if self.center_on_screen and self.attach_to:
            set_transient_for_handle(self.win.get_window(), self.attach_to)  # 位置已定，挂上去不再移动
        if token and not self.win.is_active():
            activate_window(self.win.get_window(), token)
        return False

    def reveal_late(self, gen):
        if gen == self.gen and self.item and not self.win.get_visible():
            log("页面没报就绪，照样显示：", self.item["name"])
            self.reveal(gen)
        return False

    def hide_preview(self):
        self.gen += 1  # 还在读 / 渲染的文件不再显示
        self.file = self.item = None
        self.token = ""
        if self.win and self.win.get_visible():
            self.save_state()
            self.win.hide()
            self.view.load_uri("about:blank")  # 放掉大文件占的内存；下次打开也不会先闪一下旧内容
        self.publish(visible=False)
        if self.held:
            self.held = False
            self.release()

    # ── 窗口 ──

    def ensure_window(self):
        if self.win:
            return
        win = Gtk.Window(title="Terminal Style UI")
        self.default_size = screen_default_size()
        width, height = self.state.get("size") or self.default_size
        win.set_default_size(width, height)
        header = Gtk.HeaderBar(show_close_button=True, title="Terminal Style UI")
        self.open_button = Gtk.Button(label="打开")
        self.open_button.connect("clicked", self.on_open_clicked)
        header.pack_start(self.open_button)
        win.set_titlebar(header)

        manager = WebKit2.UserContentManager()
        manager.register_script_message_handler("tmd")  # shell.html 经 webkit.messageHandlers.tmd 报 first / binary
        manager.connect("script-message-received::tmd", self.on_message)
        view = WebKit2.WebView(user_content_manager=manager)
        settings = view.get_settings()
        settings.set_enable_developer_extras(DEBUG)
        settings.set_enable_write_console_messages_to_stdout(DEBUG)
        view.set_zoom_level(self.state.get("zoom", 1.0))
        view.connect("decide-policy", self.on_decide_policy)
        view.connect("context-menu", self.on_context_menu)
        view.connect("scroll-event", self.on_scroll)
        win.add(view)
        win.connect("key-press-event", self.on_key)
        win.connect("delete-event", self.on_delete)
        win.connect("map-event", self.on_map)
        if DEBUG:
            win.connect("notify::is-active", lambda w, _: log("窗口焦点：", "有" if w.is_active() else "无"))
        header.show_all()
        view.show()
        win.realize()  # 有了 GdkWindow 才能挂到 Nautilus 窗口上
        self.win, self.view, self.header = win, view, header

    def update_header(self):
        item = self.item
        self.win.set_title(item["name"])
        self.header.set_title(item["name"])
        self.header.set_subtitle(subtitle(item))
        app = Gio.AppInfo.get_default_for_type(item["type"], False) if item.get("type") else None
        self.open_button.set_label(f"用 {app.get_display_name()} 打开" if app else "打开")

    def on_open_clicked(self, button):
        if not self.item:
            return
        uri = self.item["file"].get_uri()
        try:
            Gtk.show_uri_on_window(self.win, uri, Gtk.get_current_event_time())
        except GLib.Error as e:
            log("打开失败：", uri, e.message)
            return
        self.hide_preview()

    def on_delete(self, win, event):
        self.hide_preview()
        return True  # 只隐藏，不销毁：下次打开不用重建网页视图

    def on_key(self, win, event):
        mods = event.state & Gtk.accelerator_get_default_mod_mask()
        key = event.keyval
        if mods == 0:
            if key in (Gdk.KEY_space, Gdk.KEY_Escape):
                self.hide_preview()
                return True
            if self.arrows_to_nautilus and key in ARROWS:
                self.select_neighbor(ARROWS[key])
                return True
        elif mods & ~Gdk.ModifierType.SHIFT_MASK == Gdk.ModifierType.CONTROL_MASK:
            if key in (Gdk.KEY_equal, Gdk.KEY_plus, Gdk.KEY_KP_Add):
                self.zoom_by(1)
            elif key in (Gdk.KEY_minus, Gdk.KEY_underscore, Gdk.KEY_KP_Subtract):
                self.zoom_by(-1)
            elif key in (Gdk.KEY_0, Gdk.KEY_KP_0):
                self.zoom_by(0)
            elif key == Gdk.KEY_w:
                self.hide_preview()
            else:
                return False
            return True
        return False

    def on_scroll(self, view, event):
        if not event.state & Gdk.ModifierType.CONTROL_MASK:
            return False
        if event.direction == Gdk.ScrollDirection.SMOOTH:
            self.zoom_acc += event.delta_y
        else:
            self.zoom_acc += {Gdk.ScrollDirection.UP: -1, Gdk.ScrollDirection.DOWN: 1}.get(event.direction, 0)
        if abs(self.zoom_acc) >= 1:  # 触控板的细碎滚动攒满一格才缩放一级
            self.zoom_by(-1 if self.zoom_acc > 0 else 1)
            self.zoom_acc = 0.0
        return True

    def zoom_by(self, step):
        """+1 放大 / -1 缩小 / 0 复原；页面缩放后可用列数变了，shell.html 按新宽度重排"""
        level = self.view.get_zoom_level()
        if step > 0:
            level = next((z for z in ZOOM_STEPS if z > level + 1e-3), ZOOM_STEPS[-1])
        elif step < 0:
            level = next((z for z in reversed(ZOOM_STEPS) if z < level - 1e-3), ZOOM_STEPS[0])
        else:
            level = 1.0
        self.view.set_zoom_level(level)

    def on_decide_policy(self, view, decision, kind):
        if kind == WebKit2.PolicyDecisionType.RESPONSE:
            return False
        action = decision.get_navigation_action()
        if kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION and action.get_navigation_type() == WebKit2.NavigationType.OTHER:
            return False  # 自己发起的加载（shell.html、卡片、about:blank）
        decision.ignore()  # 页面里点链接、后退、重新载入……都不在预览窗口里跳转
        uri = action.get_request().get_uri()
        if action.is_user_gesture() and uri.startswith(("http://", "https://", "mailto:")):
            Gtk.show_uri_on_window(self.win, uri, Gtk.get_current_event_time())
        return True

    def on_context_menu(self, view, menu, event, hit):
        for entry in list(menu.get_items()):
            if entry.get_stock_action() not in MENU_KEEP:
                menu.remove(entry)
        return menu.get_n_items() == 0  # 什么都不剩就不弹

    # ── 主题、字体 ──

    def is_dark(self):
        if self.desktop:
            return self.desktop.get_string("color-scheme") == "prefer-dark"
        return Gtk.Settings.get_default().props.gtk_application_prefer_dark_theme

    def mono_font(self):
        """系统等宽字体与字号（px）"""
        name = self.desktop.get_string("monospace-font-name") if self.desktop else "Monospace 11"
        desc = Pango.FontDescription.from_string(name)
        size = desc.get_size() / Pango.SCALE or 11
        px = size if desc.get_size_is_absolute() else size * 96 / 72
        if self.desktop:
            px *= self.desktop.get_double("text-scaling-factor")
        family = (desc.get_family() or "monospace").replace('"', "").replace("\\", "")
        return family, px

    def on_desktop_changed(self, settings, key):
        if key in ("color-scheme", "monospace-font-name", "text-scaling-factor") and self.visible and self.item:
            self.gen += 1  # 换了深浅色 / 字体：按新设置重新渲染
            self.display()

    def icon_uri(self, gicon):
        if gicon is None:
            return None
        flags = Gtk.IconLookupFlags.FORCE_SIZE
        info = Gtk.IconTheme.get_default().lookup_by_gicon_for_scale(gicon, 128, self.win.get_scale_factor(), flags)
        path = info.get_filename() if info else None
        return GLib.filename_to_uri(path, None) if path else None

    # ── 其他 ──

    def save_state(self):
        if not self.win.is_maximized():
            size = list(self.win.get_size())
            if size != list(self.default_size):  # 只记用户拖过的大小；没动过就跟着屏幕走
                self.state["size"] = size
            else:
                self.state.pop("size", None)
        self.state["zoom"] = self.view.get_zoom_level()
        try:
            os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
            with open(STATE_FILE, "w") as f:
                json.dump(self.state, f)
        except OSError as e:
            log("保存窗口状态失败：", e)

    def snapshot(self):
        """调试：TSU_PREVIEW_SNAPSHOT=目录 时，每次显示后把网页区域存成 PNG（自测、配图用）"""
        folder = os.environ.get("TSU_PREVIEW_SNAPSHOT")
        if not folder or not self.item:
            return
        path = os.path.join(folder, self.item["name"] + ".png")

        def done(view, result):
            try:
                view.get_snapshot_finish(result).write_to_png(path)
                log("截图：", path)
            except Exception as e:  # noqa: BLE001
                log("截图失败：", e)

        def take():
            self.view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)
            return False

        GLib.timeout_add(800, take)  # 等流式渲染多补几块


def main():
    missing = [f for f in ("shell.html", "ttu-core.js", "terminal.css") if not os.path.exists(os.path.join(RESOURCES, f))]
    if missing:
        log("缺少文件（先运行 install.sh）：", ", ".join(missing))
        return 1
    return Previewer().run(sys.argv)


if __name__ == "__main__":
    sys.exit(main())
