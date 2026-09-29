import AppKit
import SwiftUI
import Observation
import NotionKit

/// Owns the popover shown from the status item and keeps the status title (open count) fresh.
@MainActor
final class MenuBarController: NSObject {
    private let appModel: AppModel
    private let popover = NSPopover()
    private var model: MiniListModel?
    private weak var button: NSStatusBarButton?
    var onSettings: (() -> Void)?

    init(appModel: AppModel) {
        self.appModel = appModel
        super.init()
        popover.behavior = .transient
        popover.animates = true
        popover.appearance = NSAppearance(named: .darkAqua)
        NotificationCenter.default.addObserver(self, selector: #selector(defaultsChanged), name: UserDefaults.didChangeNotification, object: nil)
    }

    func attach(to button: NSStatusBarButton?) {
        self.button = button
        button?.imagePosition = .imageLeading
        updateTitle()
        track()
    }

    var isShown: Bool { popover.isShown }

    func toggle() {
        if popover.isShown { popover.performClose(nil); return }
        guard let button else { return }
        show(relativeTo: button)
    }

    /// Demo mode: the popover anchored to the backdrop's fake menu-bar icon instead.
    func showForDemo(anchor: NSView) { show(relativeTo: anchor) }
    func closeForDemo() { popover.performClose(nil) }
    func expandForDemo(pinID: String) {
        withAnimation(Theme.Motion.contents) { model?.toggleExpanded(pinID) }
    }

    private func show(relativeTo button: NSView) {
        let model = MiniListModel(appModel: appModel)
        self.model = model
        let view = MiniListView(model: model, onOpenInNotch: { [weak self] id in
            self?.popover.performClose(nil)
            NotificationCenter.default.post(name: .openPinInNotchRequested, object: id)
        }, onSettings: { [weak self] in
            self?.popover.performClose(nil)
            self?.onSettings?()
        })
        let host = NSHostingController(rootView: view)
        host.view.frame = NSRect(x: 0, y: 0, width: 320, height: 440)
        popover.contentViewController = host
        popover.contentSize = NSSize(width: 320, height: 440)
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }

    @objc private func defaultsChanged() { updateTitle() }

    func updateTitle() {
        let total = MiniList.totalOpen(pins: appModel.pinStore.pins, summaries: PinSummaryService.shared.summaries)
        let title = MiniList.statusTitle(totalOpen: total, showCount: MenuBarPrefs.showCount)
        if button?.title != title { button?.title = title }
    }

    private func track() {
        withObservationTracking {
            _ = PinSummaryService.shared.summaries
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.updateTitle()
                self?.track()
            }
        }
    }
}
