#!/bin/zsh
# build.sh —— 构建并安装 Terminal Style UI.app（含 Quick Look 预览扩展）（2026-09-25 Claude Code）
#   ./build.sh            构建到临时目录（每次新建，不删旧的），安装到 ~/Applications 并登记扩展
#   ./build.sh --no-install
# 依赖：Xcode（swiftc）、同级 terminal-style-ui-web（先打包 dist/ttu-core.js）、钥匙串里的 Apple Development 签名证书
set -euo pipefail
cd "$(dirname "$0")"
WEB="../terminal-style-ui-web"
# 在临时目录构建：源码目录（Documents）里的文件带 Finder 扩展属性，codesign 会拒签
BUILD="${TMPDIR:-/tmp}/terminal-markdown-build/$(date +%Y%m%d-%H%M%S)"
APP="$BUILD/Terminal Style UI.app"
APPEX="$APP/Contents/PlugIns/TMDPreview.appex"
TARGET="arm64-apple-macos13.0"
IDENTITY="${TMD_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development/ {print $2; exit}')}"
[[ -n "$IDENTITY" ]] || IDENTITY="-" # 没有证书时临时签名（扩展可能不被系统加载）

(cd "$WEB" && node scripts/build-core.mjs)

mkdir -p "$APP/Contents/MacOS" "$APPEX/Contents/MacOS" "$APPEX/Contents/Resources"
cp -X App/Info.plist "$APP/Contents/Info.plist"
cp -X Extension/Info.plist "$APPEX/Contents/Info.plist"
python3 gen_types.py "$APP/Contents/Info.plist" "$APPEX/Contents/Info.plist"
# 图标：与 VSCode 插件同一张（256px），生成 icns
ICONSET="$BUILD/AppIcon.iconset"; mkdir -p "$ICONSET" "$APP/Contents/Resources"
for s in 16 32 64 128 256; do sips -z $s $s ../terminal-style-ui-vscode/media/icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null; done
for s in 16 32 64 128; do cp "$ICONSET/icon_$((s * 2))x$((s * 2)).png" "$ICONSET/icon_${s}x${s}@2x.png"; done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
cp -X "$WEB/dist/ttu-core.js" "$WEB/terminal.css" Extension/shell.html "$APPEX/Contents/Resources/"

swiftc -O -target "$TARGET" -module-name TMDPreview -parse-as-library \
  -framework QuickLookUI -framework WebKit -framework AppKit \
  -Xlinker -e -Xlinker _NSExtensionMain \
  Extension/PreviewProvider.swift -o "$APPEX/Contents/MacOS/TMDPreview"
swiftc -O -target "$TARGET" -module-name TerminalStyleUI App/main.swift -o "$APP/Contents/MacOS/TerminalStyleUI"

codesign --force --sign "$IDENTITY" --entitlements Extension/TMDPreview.entitlements --timestamp=none "$APPEX"
codesign --force --sign "$IDENTITY" --timestamp=none "$APP"
codesign --verify --deep --strict "$APP"
"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" -u "$APP" 2>/dev/null || true # 临时构建目录里的副本不登记
echo "构建完成：$APP（签名：$IDENTITY）"

[[ "${1:-}" == "--no-install" ]] && exit 0
DEST="$HOME/Applications/Terminal Style UI.app"
mkdir -p "$HOME/Applications"
LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
if [[ -d "$DEST" ]]; then # 旧版挪到 /tmp 不删，并注销登记（否则 /tmp 里的旧副本仍在系统里、与新版抢文件类型）
  OLD="/tmp/Terminal Style UI.app.old.$(date +%s)"
  pluginkit -r "$DEST/Contents/PlugIns/TMDPreview.appex" 2>/dev/null || true
  "$LSR" -u "$DEST" 2>/dev/null || true
  mv "$DEST" "$OLD"
fi
ditto --noextattr --noqtn "$APP" "$DEST"
"$LSR" -f "$DEST"
pluginkit -a "$DEST/Contents/PlugIns/TMDPreview.appex"
pluginkit -e use -i com.apollozhang.terminal-style-ui.preview
qlmanage -r >/dev/null 2>&1; qlmanage -r cache >/dev/null 2>&1
echo "已安装：$DEST"
