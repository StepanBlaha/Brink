import AppKit
import SwiftUI

/// A tiny black pill ("Added to Buylist ✓") that fades in near the top of the screen and out
/// again. Never takes focus or mouse events.
@MainActor
final class CaptureToast {
    static let shared = CaptureToast()

    private var panel: NSPanel?
    private var hideWork: DispatchWorkItem?

    static func show(_ message: String, isError: Bool = false) {
        shared.present(message, isError: isError)
    }

    private func present(_ message: String, isError: Bool) {
        hideWork?.cancel()
        let panel = self.panel ?? makePanel()
        self.panel = panel

        let host = NSHostingView(rootView: ToastView(message: message, isError: isError))
        host.frame.size = host.fittingSize
        panel.contentView = host
        panel.setContentSize(host.fittingSize)
        position(panel)

        if !panel.isVisible { panel.alphaValue = 0 }
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.18
            panel.animator().alphaValue = 1
        }

        let work = DispatchWorkItem { [weak self, weak panel] in
            guard let panel else { return }
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.35
                panel.animator().alphaValue = 0
            }, completionHandler: {
                MainActor.assumeIsolated { if panel.alphaValue == 0 { panel.orderOut(nil) } }
                _ = self
            })
        }
        hideWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (isError ? 2.6 : 1.7), execute: work)
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        return panel
    }

    private func position(_ panel: NSPanel) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = panel.frame.size
        panel.setFrameOrigin(NSPoint(x: frame.midX - size.width / 2, y: frame.maxY - size.height - 36))
    }
}

private struct ToastView: View {
    let message: String
    let isError: Bool
    @State private var shown = false

    var body: some View {
        Text(message)
            .font(Theme.Font.small.weight(.medium))
            .foregroundStyle(isError ? Theme.Color.danger : Theme.Color.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(Capsule().fill(Theme.Color.background))
            .overlay(Capsule().strokeBorder(Theme.Color.divider, lineWidth: 1))
            .scaleEffect(shown ? 1 : 0.9)
            .padding(12)
            .onAppear { withAnimation(Theme.Motion.contents) { shown = true } }
    }
}
