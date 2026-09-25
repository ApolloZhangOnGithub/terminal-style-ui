// PreviewProvider.swift —— Quick Look 预览扩展（Terminal Style UI，2026-09-25 Claude Code）
// 访达里按空格：读文件 → 自己的 WKWebView 加载 shell.html（内含 ttu-core.js，终端渲染管线打包版）→ 页面里按窗口宽度
// 流式渲染：第一块（300 行）出来就显示，其余陆续追加；窗口变宽窄自动重排。
// Markdown 照常渲染；代码 / 文本行号贴左、带高亮；类型由 ttu-core 的 detectFile 判断（后缀只是证据之一）。
// view-based 预览（不用 data-based：那种 HTML 里 JS 不执行，只能一次渲染完整篇，大文件慢）。
import AppKit
import QuickLookUI
import WebKit

final class PreviewViewController: NSViewController, QLPreviewingController, WKNavigationDelegate, WKScriptMessageHandler {
    private static let maxBytes = 8 << 20 // 超过只取开头

    private var webView: WKWebView!
    private var loaded: CheckedContinuation<Void, Error>?
    private var shown: CheckedContinuation<Void, Error>?

    override func loadView() {
        let config = WKWebViewConfiguration()
        // 预览窗口是 Quick Look 跨进程托管的，WebKit 误判网页「看不见」→ 挂起网页进程、冻结图层：第一帧之后滚动 / 追加的分块
        // 全成空白（日志：prepareToSuspend、freezeAllLayerTrees）。不挂起
        if #available(macOS 14.0, *) { config.preferences.inactiveSchedulingPolicy = .none }
        config.userContentController.add(WeakHandler(self), name: "tmd")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        view = webView
        preferredContentSize = NSSize(width: 800, height: 600)
    }

    func preparePreviewOfFile(at url: URL) async throws {
        let (text, note) = try Self.read(url)
        let dark = view.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let resources = Bundle(for: Self.self).resourceURL!

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            loaded = cont
            // 首帧就用对的底色：页面脚本运行前注入主题（不能给文件网址加 ?theme= 参数——loadFileURL 会抛 NSInvalidArgumentException）
            let controller = webView.configuration.userContentController
            controller.removeAllUserScripts()
            controller.addUserScript(WKUserScript(source: "window.__tmdTheme = \"\(dark ? "dark" : "light")\";", injectionTime: .atDocumentStart, forMainFrameOnly: true))
            webView.loadFileURL(resources.appendingPathComponent("shell.html"), allowingReadAccessTo: resources)
        }
        let args = try JSONSerialization.data(withJSONObject: [url.lastPathComponent, text, dark ? "dark" : "light", note])
        let call = "tmdStart.apply(null, \(String(decoding: args, as: UTF8.self)))"
        // 第一块渲染出来再告诉 Quick Look「好了」（二进制文件则报错，交还系统默认预览）
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            shown = cont
            webView.evaluateJavaScript(call) { [weak self] _, error in
                if let error { self?.finishShown(.failure(error)) }
            }
        }
    }

    private static func read(_ url: URL) throws -> (String, String) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var data = try handle.read(upToCount: maxBytes + 1) ?? Data()
        var note = ""
        if data.count > maxBytes {
            data = data.prefix(maxBytes)
            note = "文件较大，只显示开头 \(maxBytes >> 20) MB"
        }
        // UTF-8 优先；不是合法 UTF-8 时按 UTF-16（带 BOM）/ GB18030 / 有损 UTF-8 依次试
        let gb18030 = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(CFStringEncoding(CFStringEncodings.GB_18030_2000.rawValue)))
        let text = String(data: data, encoding: .utf8)
            ?? (data.starts(with: [0xFF, 0xFE]) || data.starts(with: [0xFE, 0xFF]) ? String(data: data, encoding: .utf16) : nil)
            ?? String(data: data, encoding: gb18030)
            ?? String(decoding: data, as: UTF8.self)
        return (text, note)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded?.resume()
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loaded?.resume(throwing: error)
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loaded?.resume(throwing: error)
        loaded = nil
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "first": finishShown(.success(()))
        case "binary": finishShown(.failure(PreviewError.binary))
        default: break
        }
    }

    private func finishShown(_ result: Result<Void, Error>) {
        shown?.resume(with: result)
        shown = nil
    }
}

// WKUserContentController 强引用处理者：中间隔一层弱引用，避免与视图控制器循环引用
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

enum PreviewError: LocalizedError {
    case binary
    var errorDescription: String? { "二进制文件" }
}
