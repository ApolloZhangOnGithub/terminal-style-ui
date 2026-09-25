// crop.swift —— 裁掉图片顶部若干像素（2026-09-25 Claude Code）：crop <in.png> <out.png> <顶部像素>
import AppKit
let a = CommandLine.arguments
let src = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: a[1])))!.cgImage!
let top = Int(a[3])!
let cropped = src.cropping(to: CGRect(x: 0, y: top, width: src.width, height: src.height - top))!
try! NSBitmapImageRep(cgImage: cropped).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
