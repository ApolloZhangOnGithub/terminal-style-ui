#!/bin/bash
# install.sh —— 安装 Nautilus 空格预览（Terminal Style UI 的 Linux 版「快速查看」）
#   ./install.sh              打包渲染核心 → 装到 ~/.local/share/terminal-style-ui-nautilus，登记 D-Bus 服务与桌面文件
#   ./install.sh --dest DIR   只把程序文件放进 DIR，不登记（开发调试：手动运行 DIR/tsu-preview.py）
# 依赖：Node（打包渲染核心）、同级 terminal-style-ui-web、系统 Python 的 GTK3 + WebKitGTK 4.1
#   Ubuntu / Debian：sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1
# 重装直接覆盖同名文件，不删除任何东西
set -euo pipefail
cd "$(dirname "$0")"
WEB=../terminal-style-ui-web
APP_ID=com.apollozhang.TerminalStyleUI.Preview
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DEST="$DATA/terminal-style-ui-nautilus"
REGISTER=1
if [[ "${1:-}" == "--dest" ]]; then
  DEST="$(realpath -m "${2:?--dest 后面要跟目录}")"
  REGISTER=0
fi
PYTHON=/usr/bin/python3 # 用系统 Python：conda / pyenv 的 Python 没有 GTK 绑定

"$PYTHON" -I -c 'import gi; gi.require_version("Gtk", "3.0"); gi.require_version("WebKit2", "4.1"); from gi.repository import Gtk, WebKit2' 2>/dev/null || {
  echo "缺少 GTK3 / WebKitGTK 4.1 的 Python 绑定。Ubuntu / Debian：sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1" >&2
  exit 1
}

[[ -d "$WEB/node_modules" ]] || (cd "$WEB" && npm ci --no-audit --no-fund)
(cd "$WEB" && node scripts/build.mjs) # → dist/ttu-core.js（只用仓库里的 vendor/）

# 预览页与 Mac 快速查看共用同一份 shell.html
install -d "$DEST"
install -m 755 tsu-preview.py "$DEST/"
install -m 644 "$WEB/dist/ttu-core.js" "$WEB/terminal.css" ../terminal-style-ui-quicklook/Extension/shell.html "$DEST/"
install -m 644 ../terminal-style-ui-vscode/media/icon.png "$DEST/icon.png"
echo "已装到：$DEST"
[[ $REGISTER == 1 ]] || exit 0

# D-Bus 服务：Nautilus 按空格时调 org.gnome.NautilusPreviewer，没在运行就按这个文件拉起本程序。
# 用户目录的服务文件优先于系统目录：装了 Sushi（GNOME 自带预览）也是本程序生效
install -d "$DATA/dbus-1/services" "$DATA/applications"
cat >"$DATA/dbus-1/services/org.gnome.NautilusPreviewer.service" <<EOF
[D-BUS Service]
Name=org.gnome.NautilusPreviewer
Exec=$PYTHON -I "$DEST/tsu-preview.py" --gapplication-service
EOF
# 桌面文件：GNOME Shell 按窗口的应用 ID 找它（任务切换里的图标、名字）；不出现在应用列表里
cat >"$DATA/applications/$APP_ID.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Terminal Style UI
Comment=Nautilus 空格预览：终端 TUI 风格显示 Markdown / 代码
Exec=$PYTHON -I "$DEST/tsu-preview.py" %U
Icon=$DEST/icon.png
NoDisplay=true
StartupNotify=false
EOF

# 会话总线重读服务文件；旧版还在运行就让它退出（下次按空格拉起新版）
gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
  --method org.freedesktop.DBus.ReloadConfig >/dev/null
gdbus call --session --dest $APP_ID --object-path "/${APP_ID//.//}" \
  --method org.freedesktop.Application.ActivateAction "'quit'" "@av []" "@a{sv} {}" >/dev/null 2>&1 || true
if [[ -f /usr/share/dbus-1/services/org.gnome.NautilusPreviewer.service ]]; then
  echo "提示：系统装了 Sushi（GNOME 自带预览），空格预览现在由本程序接管"
fi
echo "已登记。在 Nautilus 里选中文件按空格即可预览"
