# Terminal Style UI —— Nautilus 空格预览（Linux 版快速查看）

属于 [terminal-style-ui](https://github.com/ApolloZhangOnGithub/terminal-style-ui)，是 [Mac 快速查看](../terminal-style-ui-quicklook/) 的 Linux（GNOME）版。

Nautilus（GNOME「文件」）里选中文件按**空格**，用终端 TUI 同款渲染显示：Markdown 照常渲染（表格、代码块、引用……），代码 / 文本带高亮和灰色行号。与 Mac 快速查看共用同一个预览页（`shell.html` + `ttu-core.js`），输出一致：按窗口宽度排版，拉宽、缩放自动重排；滚轮整行滚动（滚动时右上 / 右下角显示上下还有多少行）；大文件流式显示（第一屏马上出，其余陆续补上）。类型看内容判断，后缀只是参考。字体、字号跟随系统等宽字体（Mac 上是 Monaco），深色 / 浅色跟随系统。

图片直接显示；文件夹、二进制文件（含 PDF、音视频）显示图标和类型 / 大小 / 修改时间。Ubuntu 桌面图标（Desktop Icons NG）上按空格也是它。

| 按键 | 作用 |
|---|---|
| 空格 / Esc | 关闭 |
| ↑ ↓ ← → | 在 Nautilus 里换到相邻的文件（同访达） |
| PageUp / PageDown / Home / End、滚轮 | 滚动 |
| Ctrl+= / Ctrl+- / Ctrl+0、Ctrl+滚轮 | 缩放 |

左上角「用 … 打开」按钮用默认程序打开。命令行：`~/.local/share/terminal-style-ui-nautilus/tsu-preview.py 文件` 直接预览（不经 Nautilus，方向键用来滚动）。

## 安装

```bash
./install.sh            # 打包渲染核心 → 装到 ~/.local/share/terminal-style-ui-nautilus，登记 D-Bus 服务
```

- 需要 Node（打包用）和系统 Python 的 GTK3 + WebKitGTK 4.1。Ubuntu 桌面版一般自带，没有就 `sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1`。
- 另外写两个文件：`~/.local/share/dbus-1/services/org.gnome.NautilusPreviewer.service`（按空格时由它拉起预览器）、`~/.local/share/applications/com.apollozhang.TerminalStyleUI.Preview.desktop`（任务切换里的图标和名字，不出现在应用列表）。
- 按空格没反应：`nautilus -q` 退出 Nautilus 再打开（会关掉所有「文件」窗口）。
- 更新：再跑一次 `./install.sh`（覆盖文件，并让还在运行的旧版退出）。
- 拖过的窗口大小、缩放记在 `~/.local/state/terminal-style-ui/nautilus-preview.json`（没拖过就按屏幕比例）。

卸载：

```bash
rm -r ~/.local/share/terminal-style-ui-nautilus ~/.local/state/terminal-style-ui
rm ~/.local/share/dbus-1/services/org.gnome.NautilusPreviewer.service ~/.local/share/applications/com.apollozhang.TerminalStyleUI.Preview.desktop
```

## 与 Sushi 的关系

Nautilus 的空格预览本来由 GNOME 的 Sushi（`gnome-sushi`）提供：按空格时 Nautilus 经 D-Bus 调 `org.gnome.NautilusPreviewer`。Ubuntu 默认没装 Sushi，所以按空格本来没有反应。本程序实现同一个接口（与 Sushi 的 `data/org.gnome.NautilusPreviewer2.xml` 一致：`ShowFile(网址, 窗口句柄, 同一文件再按是否关闭, 激活令牌)` / `Close` / `Visible` / `ParentHandle` / `SelectionEvent`），也认旧版 v1（Ubuntu 桌面图标用它）。D-Bus 按参数类型严格匹配：Nautilus 50 发 `(ssbs)`，更早只发三个参数的 Nautilus 用不了。用户目录的服务文件优先于系统目录，装了 Sushi 也是本程序生效；想换回 Sushi，删掉上面那个 `.service` 文件即可。

## 原理

预览时不需要 Node：渲染核心打包成纯 JS 的 `dist/ttu-core.js`（同 Mac 快速查看）。`tsu-preview.py` 是 GTK3 + WebKitGTK 的小程序：

1. Nautilus 调 `ShowFile` → 后台线程用 GIO 读文件（本地、sftp、smb、回收站都行）。超过 8 MB 只显示开头；编码按 UTF-8 → UTF-16（带 BOM）→ GB18030 → 有损 UTF-8 依次试（同 Mac）。
2. WebKit 加载 `shell.html`，页面脚本跑完报「就绪」→ 调 `tmdStart` 按窗口列数分块渲染 → 第一块出来才显示窗口（深色不会先闪白）。
3. 窗口先由 mutter 放到屏幕正中（屏幕的 60% × 80%；靠的是「新窗口居中」，Ubuntu 默认开着），显示出来后再经 Wayland xdg-foreign 挂到 Nautilus 窗口上，之后始终在它上面——先挂的话 mutter 会对着 Nautilus 的中线、往上偏着放，位置随 Nautilus 跑。用 Nautilus 传来的 xdg-activation 令牌提到前面、拿焦点（GTK3 的这几个 Wayland 函数没进 GObject 内省，用 ctypes 调）；方向键发 `SelectionEvent`，Nautilus 移动选择后再调 `ShowFile`。
4. 关掉预览后进程再留 5 分钟（再按空格约 0.1 秒弹出；冷启动约 0.4 秒），之后退出，D-Bus 按需再拉起。

字体：用户样式表把 `terminal.css` 里的 Monaco / PingFang 换成系统等宽字体（`org.gnome.desktop.interface` 的 `monospace-font-name`）。非 ASCII 字符锁在 1ch / 2ch 的格子里，表格和中英文对齐不受字体影响。

## 文件

- `tsu-preview.py` —— 预览器（D-Bus 服务、窗口、读文件）
- `install.sh` —— 构建安装、登记 D-Bus 服务
- 预览页用 Mac 快速查看的 `../terminal-style-ui-quicklook/Extension/shell.html`

调试：`TSU_PREVIEW_DEBUG=1`（开网页检查器、页面控制台输出打到 stdout）、`TSU_PREVIEW_SNAPSHOT=目录`（每次显示后把页面存成 PNG）。先让在运行的服务退出，再手动起一个：

```bash
gdbus call --session --dest com.apollozhang.TerminalStyleUI.Preview --object-path /com/apollozhang/TerminalStyleUI/Preview \
  --method org.freedesktop.Application.ActivateAction "'quit'" "@av []" "@a{sv} {}"
TSU_PREVIEW_DEBUG=1 /usr/bin/python3 -I ~/.local/share/terminal-style-ui-nautilus/tsu-preview.py --gapplication-service
```
