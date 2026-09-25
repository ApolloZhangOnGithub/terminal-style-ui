// compose.swift —— 把访达窗口 + Quick Look 面板拼成一张「Mac 桌面」图
// compose <out.png> <dark|light> find → 打印两个窗口编号；compose <out.png> <dark|light> <访达.png> <面板.png> → 按屏幕位置拼图、补柔和阴影，
// 窗口位置另存 <out.png>.bounds.json；compose <out.png> <dark|light> <访达.png> <面板.png> <bounds.json> → 按存下的位置重拼（不碰屏幕）。
// 背景用系统自带的 Tahoe 湖景壁纸（铺满、居中裁切），不截桌面——屏幕上别的窗口不会入镜
import AppKit
import CoreGraphics

let args = CommandLine.arguments
let out = args[1], dark = args[2] == "dark"
func bounds(_ w: [String: Any]) -> CGRect { CGRect(dictionaryRepresentation: w[kCGWindowBounds as String] as! CFDictionary)! }
func rect(_ a: [Double]) -> CGRect { CGRect(x: a[0], y: a[1], width: a[2], height: a[3]) }
var fb = CGRect.zero, pb = CGRect.zero
if args.count > 5 {
  // 重拼：窗口位置从 bounds.json 读
  let j = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[5]))) as! [String: [Double]]
  fb = rect(j["finder"]!); pb = rect(j["panel"]!)
} else {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
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
  if args.count > 3 && args[3] == "find" {
    print(finder[kCGWindowNumber as String]!, panel[kCGWindowNumber as String]!)
    exit(0)
  }
  fb = bounds(finder); pb = bounds(panel)
  // 存下窗口位置，以后换背景 / 阴影不用重拍
  let arr = { (r: CGRect) in [r.minX, r.minY, r.width, r.height] }
  try! JSONSerialization.data(withJSONObject: ["finder": arr(fb), "panel": arr(pb)], options: [.sortedKeys])
    .write(to: URL(fileURLWithPath: out + ".bounds.json"))
}
func load(_ path: String) -> CGImage {
  let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
let finderShot = load(args[3]), panelShot = load(args[4])
let union = fb.union(pb), margin: CGFloat = 60
let scale = CGFloat(finderShot.width) / fb.width
let size = CGSize(width: (union.width + margin * 2) * scale, height: (union.height + margin * 2) * scale)
let ctx = CGContext(data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
// 壁纸：等比放大铺满画布，居中裁切
let wall = load("/System/Library/ExtensionKit/Extensions/NeptuneOneWallpaper.appex/Contents/Resources/Tahoe\(dark ? "Dark" : "Light").heic")
let k = max(size.width / CGFloat(wall.width), size.height / CGFloat(wall.height))
let ww = CGFloat(wall.width) * k, wh = CGFloat(wall.height) * k
ctx.interpolationQuality = .high
ctx.draw(wall, in: CGRect(x: (size.width - ww) / 2, y: (size.height - wh) / 2, width: ww, height: wh))
func place(_ img: CGImage, _ b: CGRect) {
  // 屏幕坐标 y 向下，位图 y 向上
  let r = CGRect(x: (b.minX - union.minX + margin) * scale, y: size.height - (b.maxY - union.minY + margin) * scale, width: b.width * scale, height: b.height * scale)
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -14 * scale), blur: 40 * scale, color: CGColor(gray: 0, alpha: dark ? 0.7 : 0.35))
  ctx.draw(img, in: r)
  ctx.restoreGState()
}
place(finderShot, fb)
place(panelShot, pb)
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("ok", Int(size.width), Int(size.height))
