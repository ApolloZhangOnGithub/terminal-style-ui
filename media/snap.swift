// snap.swift —— 网页整页截图（2026-09-25 Claude Code）：snap <page.html> <out.png> <视口宽 px> [读权限目录] [JS]
// 后台 WKWebView 加载页面（可先执行一段 JS），高度按内容撑开，2 倍像素出 PNG；不开窗口
import AppKit
import WebKit

let args = CommandLine.arguments
let page = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2])
let width = CGFloat(Double(args[3])!)
let access = args.count > 4 ? URL(fileURLWithPath: args[4]) : page.deletingLastPathComponent()
let script = args.count > 5 ? args[5] : ""

final class Snapper: NSObject, WKNavigationDelegate {
  let view: WKWebView
  init(_ view: WKWebView) { self.view = view }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    w.evaluateJavaScript(script.isEmpty ? "0" : script) { _, _ in
      // 分块渲染等异步内容：稍等再量高度
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
        // 页面 body 为 inline-block 时按它的实际大小裁（否则按给定宽度、内容高度）
        w.evaluateJavaScript("(function(){var r=document.body.getBoundingClientRect();return getComputedStyle(document.body).display==='inline-block'?[Math.ceil(r.width),Math.ceil(r.height)]:[0,Math.ceil(document.documentElement.scrollHeight)]})()") { r, _ in
          let size = (r as? [NSNumber])?.map { CGFloat($0.doubleValue) } ?? [0, 600]
          let width = size[0] > 0 ? size[0] : width
          let height = size[1]
          w.frame = NSRect(x: 0, y: 0, width: width, height: height)
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            let config = WKSnapshotConfiguration()
            config.rect = NSRect(x: 0, y: 0, width: width, height: height)
            config.snapshotWidth = NSNumber(value: Double(width)) // 系统按屏幕倍率（Retina 2 倍）出图
            w.takeSnapshot(with: config) { image, error in
              guard let image, let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
                print("截图失败：\(error?.localizedDescription ?? "?")"); exit(1)
              }
              try! png.write(to: out)
              exit(0)
            }
          }
        }
      }
    }
  }
}

let app = NSApplication.shared
let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: width, height: 600), styleMask: [.borderless], backing: .buffered, defer: false)
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 600))
view.setValue(false, forKey: "drawsBackground")
window.contentView = view
window.orderFrontRegardless() // 在屏幕外：WebKit 认为可见才会绘制
let snapper = Snapper(view)
view.navigationDelegate = snapper
view.loadFileURL(page, allowingReadAccessTo: access)
app.run()
