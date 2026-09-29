import AppKit
import SwiftUI

/// Owns the floating quick-capture panel: shows it on `.quickCaptureRequested`.
@MainActor
final class QuickCaptureController {
    private let appModel: AppModel
    private let model: QuickCaptureModel
    private var panel: QuickCapturePanel?
    private var visible = false
    private var focusToken = 0
    private var observer: NSObjectProtocol?

    init(appModel: AppModel) {
        self.appModel = appModel
        model = QuickCaptureModel(appModel: appModel)
        observer = NotificationCenter.default.addObserver(forName: .quickCaptureRequested, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.show() }
        }
    }

    func show() {
        model.reloadDestination()
        model.errorMessage = nil
        if panel == nil { panel = makePanel() }
        guard let panel else { return }
        position(panel)
        if !panel.isVisible {
            visible = false
            render()
            panel.makeKeyAndOrderFront(nil)
            DispatchQueue.main.async { [weak self] in
                self?.visible = true
                self?.render()
            }
        } else {
            panel.makeKeyAndOrderFront(nil)
        }
        focusToken += 1
        render()
    }

    func close() {
        guard let panel, panel.isVisible else { return }
        visible = false
        render()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
            guard let self, !self.visible else { return }
            panel.orderOut(nil)
        }
    }

    private func submit(keepOpen: Bool) {
        guard !model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        Task {
            switch await model.save() {
            case .saved(let message):
                CaptureToast.show(message)
                if keepOpen { focusToken += 1; render() } else { close() }
            case .failed:
                break
            }
        }
    }

    private func render() {
        let view = QuickCaptureView(
            model: model, visible: visible, focusToken: focusToken,
            onSubmit: { [weak self] keepOpen in self?.submit(keepOpen: keepOpen) },
            onCancel: { [weak self] in self?.close() }
        )
        if let host = panel?.contentView as? NSHostingView<QuickCaptureView> {
            host.rootView = view
        } else {
            panel?.contentView = NSHostingView(rootView: view)
        }
    }

    private func makePanel() -> QuickCapturePanel {
        let panel = QuickCapturePanel(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 150),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.onCommandReturn = { [weak self] in self?.submit(keepOpen: true) }
        panel.onCancel = { [weak self] in self?.close() }
        return panel
    }

    private func position(_ panel: NSPanel) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = panel.frame.size
        panel.setFrameOrigin(NSPoint(x: frame.midX - size.width / 2, y: frame.maxY - size.height - 90))
    }
}
