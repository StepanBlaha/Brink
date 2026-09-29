import AppKit
import SwiftUI
import NotionKit

/// Transparent click target: click to start recording, then press a combo (Esc cancels).
struct ShortcutRecorder: NSViewRepresentable {
    @Binding var isRecording: Bool
    let onCombo: (HotkeyCombo) -> Void

    func makeNSView(context: Context) -> RecorderView {
        let view = RecorderView()
        view.owner = self
        return view
    }

    func updateNSView(_ view: RecorderView, context: Context) {
        view.owner = self
        if isRecording, view.window?.firstResponder !== view {
            DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
        } else if !isRecording, view.window?.firstResponder === view {
            DispatchQueue.main.async { view.window?.makeFirstResponder(nil) }
        }
    }

    final class RecorderView: NSView {
        var owner: ShortcutRecorder?
        override var acceptsFirstResponder: Bool { true }

        override func mouseDown(with event: NSEvent) {
            owner?.isRecording = true
            window?.makeFirstResponder(self)
        }

        override func becomeFirstResponder() -> Bool {
            HotkeySettings.shared.isRecording = true
            return true
        }

        override func resignFirstResponder() -> Bool {
            HotkeySettings.shared.isRecording = false
            DispatchQueue.main.async { [weak self] in self?.owner?.isRecording = false }
            return true
        }

        override func performKeyEquivalent(with event: NSEvent) -> Bool {
            guard window?.firstResponder === self else { return false }
            handle(event)
            return true
        }

        override func keyDown(with event: NSEvent) { handle(event) }

        private func handle(_ event: NSEvent) {
            if event.keyCode == 53 { // Esc
                owner?.isRecording = false
                window?.makeFirstResponder(nil)
                return
            }
            let mods = KeyNames.carbonModifiers(event.modifierFlags)
            guard mods != 0 else { NSSound.beep(); return } // global combos need a modifier
            let combo = HotkeyCombo(keyCode: UInt32(event.keyCode), modifiers: mods)
            owner?.onCombo(combo)
            owner?.isRecording = false
            window?.makeFirstResponder(nil)
        }
    }
}
