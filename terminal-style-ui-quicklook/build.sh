#!/bin/zsh
# build.sh —— 构建并安装 Terminal Style UI.app（含 Quick Look 预览扩展）
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
IDENTITY="${TMD_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development/ {print $2; exit}')}"
[[ -n "$IDENTITY" ]] || IDENTITY="-" # 没有证书时临时签名（扩展可能不被系统加载）

(cd "$WEB" && node scripts/build.mjs) # 只用仓库里的 vendor/，不需要定制版 runtime

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

# 通用二进制（Apple Silicon + Intel）：两个架构分别编译，再用 lipo 合并
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos13.0" -module-name TMDPreview -parse-as-library \
    -framework QuickLookUI -framework WebKit -framework AppKit \
    -Xlinker -e -Xlinker _NSExtensionMain \
    Extension/PreviewProvider.swift -o "$BUILD/TMDPreview-$arch"
  swiftc -O -target "$arch-apple-macos13.0" -module-name TerminalStyleUI App/main.swift -o "$BUILD/TerminalStyleUI-$arch"
done
lipo -create "$BUILD/TMDPreview-arm64" "$BUILD/TMDPreview-x86_64" -output "$APPEX/Contents/MacOS/TMDPreview"
lipo -create "$BUILD/TerminalStyleUI-arm64" "$BUILD/TerminalStyleUI-x86_64" -output "$APP/Contents/MacOS/TerminalStyleUI"

codesign --force --sign "$IDENTITY" --entitlements Extension/TMDPreview.entitlements --timestamp=none "$APPEX"
codesign --force --sign "$IDENTITY" --timestamp=none "$APP"
codesign --verify --deep --strict "$APP"
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
# 确认扩展确实登记着：系统按应用 ID 异步处理登记 / 注销（同 ID 的旧副本被注销时，可能连新版的扩展一起清掉），没有就重新登记
for i in 1 2 3; do
  sleep 3
  pluginkit -m -i com.apollozhang.terminal-style-ui.preview | grep -q com.apollozhang && break
  echo "扩展未登记，重新登记（第 $i 次）"
  "$LSR" -f -R "$DEST"
  pluginkit -a "$DEST/Contents/PlugIns/TMDPreview.appex"
  pluginkit -e use -i com.apollozhang.terminal-style-ui.preview
done
pluginkit -m -i com.apollozhang.terminal-style-ui.preview | grep -q com.apollozhang || { echo "扩展登记失败"; exit 1; }
qlmanage -r >/dev/null 2>&1; qlmanage -r cache >/dev/null 2>&1
echo "已安装：$DEST"
