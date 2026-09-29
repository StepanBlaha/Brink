import AppKit
import Carbon.HIToolbox
import NotionKit

/// Registers global hotkeys with Carbon `RegisterEventHotKey` (no Accessibility permission
/// needed, fires while other apps are active) and reports them to `handler`.
/// `pinIndex` is set (0-based) for `.openPinN`.
@MainActor
final class HotkeyCenter {
    typealias Handler = (HotkeyAction, _ pinIndex: Int?) -> Void

    private var handler: Handler
    private var refs: [EventHotKeyRef] = []
    private var table: [UInt32: (HotkeyAction, Int?)] = [:]
    private var eventHandler: EventHandlerRef?
    private static weak var current: HotkeyCenter?
    private static let signature: OSType = 0x4E44_4B59 // 'NDKY'

    init(handler: @escaping Handler) {
        self.handler = handler
        Self.current = self
        installEventHandler()
        registerAll()
        NotificationCenter.default.addObserver(forName: HotkeySettings.didChange, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.registerAll() }
        }
    }

    private func installEventHandler() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var hkID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hkID)
            let id = hkID.id
            DispatchQueue.main.async {
                MainActor.assumeIsolated { HotkeyCenter.current?.fire(id) }
            }
            return noErr
        }, 1, &spec, nil, &eventHandler)
    }

    private func fire(_ id: UInt32) {
        guard let (action, index) = table[id] else { return }
        handler(action, index)
    }

    func registerAll() {
        for ref in refs { UnregisterEventHotKey(ref) }
        refs.removeAll()
        table.removeAll()
        if HotkeySettings.shared.isRecording { return }
        var nextID: UInt32 = 1
        let settings = HotkeySettings.shared
        for action in HotkeyAction.allCases {
            let combo = settings.combo(for: action)
            let targets: [(HotkeyCombo, Int?)]
            if action == .openPinN {
                targets = HotkeyAction.digitKeyCodes.enumerated().map { (HotkeyCombo(keyCode: $1, modifiers: combo.modifiers), $0) }
            } else {
                targets = [(combo, nil)]
            }
            for (target, index) in targets {
                var ref: EventHotKeyRef?
                let hkID = EventHotKeyID(signature: Self.signature, id: nextID)
                let status = RegisterEventHotKey(target.keyCode, target.modifiers, hkID, GetApplicationEventTarget(), 0, &ref)
                if status == noErr, let ref {
                    refs.append(ref)
                    table[nextID] = (action, index)
                }
                nextID += 1
            }
        }
    }
}
