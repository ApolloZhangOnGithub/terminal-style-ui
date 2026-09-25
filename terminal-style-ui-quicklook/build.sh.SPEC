# SPEC: build.sh / gen_types.py —— 构建安装 Terminal Style UI.app（2026-09-25 Claude Code）
# build.sh：打包 ../terminal-style-ui-web/dist/ttu-core.js → 在 $TMPDIR/terminal-markdown-build/<时间戳> 新建目录构建（源码目录的
# Finder 扩展属性会让 codesign 拒签；每次新目录，不删旧的）→ gen_types.py 填类型 → swiftc 编译扩展（-e _NSExtensionMain）与 App
# → 用 Apple Development 证书签名（扩展带 App Sandbox）→ 装到 ~/Applications（旧版挪 /tmp）→ lsregister、pluginkit -a / -e use、
# qlmanage -r cache。--no-install 只构建。
# gen_types.py：Quick Look 按具体 UTI 选扩展（宽泛的 public.source-code / public.data 不生效，系统文本预览先抢）→ 扩展声明系统已有的
# 具体 UTI；系统不认识的后缀由 App 登记 UTImportedTypeDeclarations（com.apollozhang.terminal-style-ui.type.*）。不接管 ts / html / svg / plist。
