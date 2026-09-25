#!/usr/bin/env python3
# gen_types.py —— 给 App / 扩展的 Info.plist 填文件类型：python3 gen_types.py <App Info.plist> <扩展 Info.plist>
# Quick Look 不按宽泛类型（public.data / public.source-code）选扩展：系统自带的文本预览会先抢走代码文件，
# 扩展必须声明文件的具体 UTI。系统认识的后缀直接列 UTI；系统不认识的（动态 dyn.* 类型，如 .go .rs .WIKI）
# 由 App 登记自己的类型（UTImportedTypeDeclarations，后缀匹配不分大小写）。
# 刻意不接管：.ts（系统当 MPEG-TS 视频）、.html / .svg（保留网页 / 图片预览）、.plist（多为二进制）。
import plistlib, sys

# 系统已有的具体类型
SYSTEM_TYPES = [
    "net.daringfireball.markdown", "public.plain-text", "public.utf8-plain-text", "com.apple.log",
    "com.netscape.javascript-source", "com.microsoft.typescript", "public.python-script", "public.ruby-script",
    "com.sun.java-source", "public.swift-source", "public.c-source", "public.c-header", "public.c-plus-plus-source",
    "public.c-plus-plus-header", "public.objective-c-source", "public.objective-c-plus-plus-source", "public.php-script",
    "public.perl-script", "org.tug.lua", "public.shell-script", "public.bash-script", "public.zsh-script", "public.csh-script",
    "public.json", "public.geojson", "public.yaml", "public.toml", "com.microsoft.ini", "public.xml", "public.css",
    "org.iso.sql", "public.protobuf-source", "public.patch-file", "public.make-source", "org.tug.tex",
    "public.comma-separated-values-text", "public.tab-separated-values-text", "public.source-code", "public.script",
]
# App 自己登记的类型：(标识后缀, 说明, 父类型, [后缀…])
MD = "net.daringfireball.markdown"
TXT = "public.plain-text"
SRC = "public.source-code"
OWN_TYPES = [
    ("markdown-extra", "Markdown 文档", MD, ["mdown", "mkd", "mkdn", "mdx", "wiki", "rmd", "issue", "spec", "mdc"]),
    ("javascript-extra", "JavaScript 源码", SRC, ["cjs", "jsx", "cts"]),
    ("python-extra", "Python 源码", SRC, ["pyw", "pyi"]),
    ("go-source", "Go 源码", SRC, ["go"]),
    ("rust-source", "Rust 源码", SRC, ["rs"]),
    ("kotlin-source", "Kotlin 源码", SRC, ["kt", "kts"]),
    ("csharp-source", "C# 源码", SRC, ["cs"]),
    ("jvm-extra", "JVM 源码", SRC, ["scala", "groovy", "gradle", "clj", "cljs", "edn"]),
    ("dart-source", "Dart 源码", SRC, ["dart"]),
    ("beam-source", "Elixir / Erlang 源码", SRC, ["ex", "exs", "erl", "hrl"]),
    ("functional-source", "函数式语言源码", SRC, ["hs", "ml", "mli", "fs", "fsx", "elm"]),
    ("systems-source", "源码", SRC, ["zig", "nim", "jl", "v", "d", "cr", "odin"]),
    ("shell-extra", "脚本", SRC, ["fish", "ps1", "psm1", "bat", "cmd", "nu", "awk"]),
    ("web-extra", "前端源码", SRC, ["vue", "svelte", "astro", "scss", "sass", "less", "styl"]),
    ("json-extra", "JSON 文本", TXT, ["jsonc", "json5", "jsonl", "ndjson", "ipynb", "webmanifest"]),
    ("config-text", "配置文件", TXT, ["conf", "properties", "env", "lock", "gitignore", "gitattributes", "editorconfig", "npmrc", "prettierrc", "eslintrc", "babelrc", "nvmrc", "dockerignore", "tf", "tfvars", "hcl", "nix", "cmake", "dockerfile", "makefile", "justfile", "graphql", "gql", "prisma", "http"]),
    ("vim-script", "Vim 脚本", SRC, ["vim", "vimrc"]),
    ("text-extra", "文本", TXT, ["out", "nfo", "diz", "rst", "adoc", "asciidoc", "org", "textile", "srt", "vtt", "sub"]),
]
BASE = "com.apollozhang.terminal-style-ui.type."

app_path, ext_path = sys.argv[1], sys.argv[2]
with open(app_path, "rb") as f:
    app = plistlib.load(f)
app["UTImportedTypeDeclarations"] = [
    {
        "UTTypeIdentifier": BASE + name,
        "UTTypeDescription": desc,
        "UTTypeConformsTo": [parent, "public.text", "public.data"],
        "UTTypeTagSpecification": {"public.filename-extension": exts},
    }
    for name, desc, parent, exts in OWN_TYPES
]
with open(app_path, "wb") as f:
    plistlib.dump(app, f)

with open(ext_path, "rb") as f:
    ext = plistlib.load(f)
ext["NSExtension"]["NSExtensionAttributes"]["QLSupportedContentTypes"] = SYSTEM_TYPES + [BASE + name for name, *_ in OWN_TYPES]
with open(ext_path, "wb") as f:
    plistlib.dump(ext, f)
print(f"类型：系统 {len(SYSTEM_TYPES)} 个 + 自登记 {len(OWN_TYPES)} 组（{sum(len(e) for *_, e in OWN_TYPES)} 个后缀）")
