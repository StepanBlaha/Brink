import AppKit
import NotionKit

/// The "probe" script: no timeline. It executes one-line commands the test harness drops into
/// the marker folder (`cmd-<n>`), in order, and answers each with `ack-<n>` (the command's output).
/// Used for bug passes over the real UI with the fake Notion: trigger `{"script": "probe", "markerDirectory": …,
/// "defaults": {…}}`, then write `cmd-1`, `cmd-2`… (e.g. `open demo-launch`, `drag far 0 -150`, `ops`).
extension DemoDirector {
    func runProbe() async {
        DemoMode.mouseOverride = at(0.4, 0.4)
        var n = 1
        while true {
            guard let dir = DemoMode.trigger.markerDirectory else { return }
            let cmd = URL(fileURLWithPath: dir).appendingPathComponent("cmd-\(n)")
            guard let line = try? String(contentsOf: cmd, encoding: .utf8) else { await DemoUI.sleep(0.05); continue }
            let words = line.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ").map(String.init)
            if words.first == "quit" { try? "bye".write(to: ack(n), atomically: true, encoding: .utf8); return }
            let output = await probe(words)
            try? output.write(to: ack(n), atomically: true, encoding: .utf8)
            n += 1
        }
    }

    private func ack(_ n: Int) -> URL {
        URL(fileURLWithPath: DemoMode.trigger.markerDirectory ?? "/tmp").appendingPathComponent("ack-\(n)")
    }

    private func arg(_ words: [String], _ i: Int) -> String { i < words.count ? words[i] : "" }
    private func num(_ words: [String], _ i: Int, _ fallback: CGFloat = 0) -> CGFloat { CGFloat(Double(arg(words, i)) ?? Double(fallback)) }

    private func probe(_ words: [String]) async -> String {
        let s = Settings.shared
        switch arg(words, 0) {
        case "state": return dock.demoStateDump()
        case "edge": s.edge = DockEdge(rawValue: arg(words, 1)) ?? .right; dock.edgeDidChange()
        case "merge": s.mergeWithHardwareNotch = arg(words, 1) == "on"
        case "display": s.displayPreference = DisplayPreference(stored: arg(words, 1))
        case "size": s.size = DockSize(rawValue: arg(words, 1)) ?? .medium
        case "pill": s.pillStyle = PillStyle.resolve(stored: arg(words, 1), legacyHidden: nil)
        case "phase": dock.demoSetPhase(NotchPhase.named(arg(words, 1)))
        case "open": dock.demoOpen(pinID: arg(words, 1))
        case "addflow": dock.demoOpenAddFlow(database: arg(words, 1) == "db")
        case "peek": dock.demoShowPeek(pinID: arg(words, 1) == "none" ? nil : arg(words, 1))
        case "mouse":
            DemoMode.mouseOverride = arg(words, 1) == "none" ? nil : CGPoint(x: num(words, 1), y: num(words, 2))
        case "sleep": await DemoUI.sleep(Double(arg(words, 1)) ?? 0.5)
        case "drag": return await probeDrag(handle: arg(words, 1), dx: num(words, 2), dy: num(words, 3), steps: Int(arg(words, 4)) ?? 12)
        case "dblclick": return await probeDoubleClick(handle: arg(words, 1))
        case "text": return dock.demoTextView(pinID: arg(words, 1))?.string ?? "no text view"
        case "caret": return probeCaret(pinID: arg(words, 1), find: words.dropFirst(2).joined(separator: " "))
        case "key":
            let sent = probeKey(pinID: arg(words, 1), key: arg(words, 2), mods: arg(words, 3))
            await DemoUI.sleep(0.15)
            return sent + "; caret \(dock.demoTextView(pinID: arg(words, 1))?.selectedRange() ?? NSRange())"
        case "undo": dock.demoTextView(pinID: arg(words, 1))?.undoManager?.undo()
        case "undoinfo":
            let u = dock.demoTextView(pinID: arg(words, 1))?.undoManager
            return "canUndo \(u?.canUndo ?? false) '\(u?.undoActionName ?? "")' canRedo \(u?.canRedo ?? false) level \(u?.groupingLevel ?? -1) byEvent \(u?.groupsByEvent ?? false)"
        case "redo": dock.demoTextView(pinID: arg(words, 1))?.undoManager?.redo()
        case "pasteimage": return probePasteImage(pinID: arg(words, 1), path: arg(words, 2))
        case "ops": return DemoNotionServer.drainLog()
        case "blocks": return DemoNotionServer.dumpTree(parent: arg(words, 1))
        case "windows":
            return NSApp.windows.filter(\.isVisible).map { "\(type(of: $0)) \($0.frame) level \($0.level.rawValue)" }.joined(separator: "\n")
        case "handle": return await probeHandleDrag(pinID: arg(words, 1), from: words.dropFirst(3).joined(separator: " "), lines: Int(arg(words, 2)) ?? 1)
        default: return "unknown command \(words)"
        }
        await DemoUI.sleep(0.05)
        return "ok"
    }

    // MARK: - Resize grips (synthetic mouse events + the demo pointer override)

    /// Window-local (top-left origin) center of a grip on the expanded panel.
    private func gripPoint(_ handle: String) -> CGPoint {
        let r = dock.demoExpandedBody
        switch (Settings.shared.edge, handle) {
        case (.right, "far"): return CGPoint(x: r.minX + 3, y: r.midY)
        case (.left, "far"): return CGPoint(x: r.maxX - 3, y: r.midY)
        case (.top, "far"): return CGPoint(x: r.midX, y: r.maxY - 3)
        case (.right, "a"): return CGPoint(x: r.minX + 8, y: r.minY + 8)
        case (.right, _): return CGPoint(x: r.minX + 8, y: r.maxY - 8)
        case (.left, "a"): return CGPoint(x: r.maxX - 8, y: r.minY + 8)
        case (.left, _): return CGPoint(x: r.maxX - 8, y: r.maxY - 8)
        case (.top, "a"): return CGPoint(x: r.minX + 8, y: r.maxY - 8)
        case (.top, _): return CGPoint(x: r.maxX - 8, y: r.maxY - 8)
        }
    }

    private func send(_ type: NSEvent.EventType, screen: CGPoint, clicks: Int = 1) {
        let window = panelWindow
        DemoMode.mouseOverride = screen
        let point = window.convertPoint(fromScreen: screen)
        guard let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                                             windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: clicks,
                                             pressure: type == .leftMouseUp ? 0 : 1) else { return }
        window.sendEvent(event)
    }

    /// Drags a grip by (dx, dy) screen points (y up) in `steps`; returns sizes seen on the way.
    private func probeDrag(handle: String, dx: CGFloat, dy: CGFloat, steps: Int) async -> String {
        panelWindow.ignoresMouseEvents = false
        let start = dock.demoScreenPoint(gripPoint(handle))
        var trace: [String] = ["start \(start) body \(dock.demoExpandedBody)"]
        send(.leftMouseDown, screen: start)
        for i in 1...max(steps, 1) {
            let t = CGFloat(i) / CGFloat(max(steps, 1))
            send(.leftMouseDragged, screen: CGPoint(x: start.x + dx * t, y: start.y + dy * t))
            await DemoUI.sleep(0.016)
            trace.append("step \(i) body \(dock.demoExpandedBody)")
        }
        send(.leftMouseUp, screen: CGPoint(x: start.x + dx, y: start.y + dy))
        await DemoUI.sleep(0.4)
        DemoMode.mouseOverride = at(0.4, 0.4)
        trace.append("end body \(dock.demoExpandedBody)")
        return trace.joined(separator: "\n")
    }

    private func probeDoubleClick(handle: String) async -> String {
        panelWindow.ignoresMouseEvents = false
        let p = dock.demoScreenPoint(gripPoint(handle))
        for clicks in 1...2 {
            send(.leftMouseDown, screen: p, clicks: clicks)
            await DemoUI.sleep(0.04)
            send(.leftMouseUp, screen: p, clicks: clicks)
            await DemoUI.sleep(0.08)
        }
        DemoMode.mouseOverride = at(0.4, 0.4)
        return "double-clicked \(p)"
    }
}

extension NotchPhase {
    static func named(_ name: String) -> NotchPhase {
        switch name { case "strip": return .strip; case "expanded": return .expanded; default: return .resting }
    }
}
