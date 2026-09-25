// compose.swift —— 把访达窗口 + Quick Look 面板拼成一张「Mac 桌面」图
// compose <out.png> <dark|light> find → 打印两个窗口编号；compose <out.png> <dark|light> <访达.png> <面板.png> → 按屏幕位置拼图、补柔和阴影。
// 背景是画出来的，不截桌面——屏幕上别的窗口不会入镜
import AppKit
import CoreGraphics

let out = CommandLine.arguments[1], dark = CommandLine.arguments[2] == "dark"
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
func bounds(_ w: [String: Any]) -> CGRect { CGRect(dictionaryRepresentation: w[kCGWindowBounds as String] as! CFDictionary)! }
// 访达进程在中文系统里叫「访达」；快速查看面板也属于它，窗口名为空
// 访达窗口：第 0 层、窗口名 = 文件夹名；快速查看面板：窗口名为空（层级随焦点在 0 / 3 之间变）
let ownedByFinder = { (w: [String: Any]) in ["Finder", "访达"].contains(w[kCGWindowOwnerName as String] as? String ?? "") }
let layer = { (w: [String: Any]) in w[kCGWindowLayer as String] as? Int ?? 0 }
let dirName = ProcessInfo.processInfo.environment["FINDER_DIR_NAME"] ?? "tsu-demo" // 访达窗口名 = 演示文件夹名
let finder = list.first { ownedByFinder($0) && layer($0) == 0 && ($0[kCGWindowName as String] as? String) == dirName }
let panel = list.first { ownedByFinder($0) && layer($0) < 20 && (($0[kCGWindowName as String] as? String) ?? "").isEmpty && bounds($0).width > 300 && bounds($0).height > 200 }
guard let finder, let panel else {
  print("找不到窗口：finder=\(finder != nil) panel=\(panel != nil)")
  for w in list.prefix(12) { print(w[kCGWindowOwnerName as String] ?? "", w[kCGWindowName as String] ?? "", bounds(w)) }
  exit(1)
}
// 模式 find：只打印两个窗口的编号，交给 screencapture 截（CGWindowListCreateImage 在新系统上已禁用）
if CommandLine.arguments.count > 3 && CommandLine.arguments[3] == "find" {
  print(finder[kCGWindowNumber as String]!, panel[kCGWindowNumber as String]!)
  exit(0)
}
func load(_ path: String) -> CGImage { NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: path)))!.cgImage! }
let finderShot = load(CommandLine.arguments[3]), panelShot = load(CommandLine.arguments[4])
func shot(_ w: [String: Any]) -> CGImage { w[kCGWindowNumber as String] as? Int == finder[kCGWindowNumber as String] as? Int ? finderShot : panelShot }
let fb = bounds(finder), pb = bounds(panel)
let union = fb.union(pb), margin: CGFloat = 60
let scale = CGFloat(shot(finder).width) / fb.width
let size = CGSize(width: (union.width + margin * 2) * scale, height: (union.height + margin * 2) * scale)
let ctx = CGContext(data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let colors = dark ? [CGColor(srgbRed: 0.10, green: 0.12, blue: 0.20, alpha: 1), CGColor(srgbRed: 0.22, green: 0.14, blue: 0.30, alpha: 1)]
                  : [CGColor(srgbRed: 0.74, green: 0.84, blue: 0.97, alpha: 1), CGColor(srgbRed: 0.93, green: 0.82, blue: 0.93, alpha: 1)]
ctx.drawLinearGradient(CGGradient(colorsSpace: nil, colors: colors as CFArray, locations: [0, 1])!, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
func place(_ img: CGImage, _ b: CGRect) {
  // 屏幕坐标 y 向下，位图 y 向上
  let r = CGRect(x: (b.minX - union.minX + margin) * scale, y: size.height - (b.maxY - union.minY + margin) * scale, width: b.width * scale, height: b.height * scale)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -14 * scale), blur: 40 * scale, color: CGColor(gray: 0, alpha: dark ? 0.7 : 0.35))
  ctx.draw(img, in: r)
  ctx.restoreGState()
}
place(shot(finder), fb)
place(shot(panel), pb)
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("ok", Int(size.width), Int(size.height))
