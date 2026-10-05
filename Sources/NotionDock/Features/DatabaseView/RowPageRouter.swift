import AppKit
import Observation
import SwiftUI
import NotionKit

/// Opens a database row (a Notion page) in the side view. Surfaces outside the panel (menu-bar
/// list, hover peek) call `open`, which asks the notch to open the pin and leaves the row for the
/// pin's view to pick up. Views inside the panel call `makeModel` to get the row's page editor.
@MainActor
@Observable
final class RowPageRouter {
    static let shared = RowPageRouter()

    /// A row waiting for its pin's view to show it.
    private(set) var pending: RowPageTarget?
    @ObservationIgnored private var appModel: AppModel?

    func configure(appModel: AppModel) { self.appModel = appModel }

    /// Opens `target.pinID` in the notch, then its row page.
    func open(_ target: RowPageTarget) {
        pending = target
        NotificationCenter.default.post(name: .openPinInNotchRequested, object: target.pinID)
        // A request nobody picks up (pin gone, panel refused) must not fire on a later open.
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if self?.pending == target { self?.pending = nil }
        }
    }

    /// Takes the waiting row if it is for this pin.
    func take(forPin pinID: String) -> RowPageTarget? {
        guard let target = pending, target.isFor(pin: pinID) else { return nil }
        pending = nil
        return target
    }

    func makeModel(for target: RowPageTarget) -> PageViewModel? {
        guard let appModel else { return nil }
        return PageViewModel(pageId: target.rowID, pinId: target.cacheKey, client: appModel.client,
                             cache: appModel.cache, writeQueue: appModel.writeQueue)
    }

    /// notion:// if the Notion app is installed, otherwise https.
    static func openInNotion(id: String) {
        let installed = NSWorkspace.shared.urlForApplication(toOpen: URL(string: "notion://")!) != nil
        if let url = NotionLink.preferredURL(id: id, appInstalled: installed) { NSWorkspace.shared.open(url) }
    }
}

private struct OpenRowPageKey: EnvironmentKey {
    static let defaultValue: ((_ rowID: String, _ title: String) -> Void)? = nil
}

extension EnvironmentValues {
    /// Set by `RowPageHost`; rows call it to show their page in place of the list.
    var openRowPage: ((_ rowID: String, _ title: String) -> Void)? {
        get { self[OpenRowPageKey.self] }
        set { self[OpenRowPageKey.self] = newValue }
    }
}
