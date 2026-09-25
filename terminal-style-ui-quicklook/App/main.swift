// main.swift —— Terminal Style UI.app：Quick Look 扩展的宿主。
// 本身没有功能：打开一次让系统登记里面的预览扩展，弹个说明就退出。
import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let alert = NSAlert()
alert.messageText = "Terminal Style UI 预览已启用"
alert.informativeText = "在访达里选中文件按空格，Markdown、代码、文本都会用终端 TUI 同款渲染显示（任意后缀，按内容判断类型）。\n\n如果没生效：系统设置 → 通用 → 登录项与扩展 → 快速查看，勾上 Terminal Style UI。"
alert.addButton(withTitle: "好")
NSApp.activate(ignoringOtherApps: true)
alert.runModal()
