import AppKit
import SwiftUI

/// An invisible, focusable text field used only to catch what macOS's Character Viewer
/// (`NSApp.orderFrontCharacterPalette`) inserts: the palette always inserts into the current
/// first responder via `insertText(_:)`, so this just needs to be that first responder.
final class CapturingTextField: NSTextField {
    var onInsert: ((String) -> Void)?

    override func insertText(_ insertString: Any) {
        if let value = insertString as? String, !value.isEmpty {
            onInsert?(value)
        }
        // Stay empty so the next palette pick starts clean and nothing lingers on screen.
        stringValue = ""
    }
}

/// Focuses the hidden capture field and opens the system Character Viewer on demand.
@MainActor
final class PaletteCaptureCoordinator {
    fileprivate weak var field: CapturingTextField?

    func focusAndOpenPalette() {
        guard let field else { return }
        field.window?.makeFirstResponder(field)
        NSApp.orderFrontCharacterPalette(nil)
    }
}

struct CharacterPaletteCapture: NSViewRepresentable {
    let coordinator: PaletteCaptureCoordinator
    let onInsert: (String) -> Void

    func makeNSView(context: Context) -> CapturingTextField {
        let field = CapturingTextField(frame: .zero)
        field.isBordered = false
        field.drawsBackground = false
        field.textColor = .clear
        field.focusRingType = .none
        field.onInsert = onInsert
        coordinator.field = field
        return field
    }

    func updateNSView(_ nsView: CapturingTextField, context: Context) {
        nsView.onInsert = onInsert
    }
}
