import SwiftUI

/// Renders a `PinIconDisplay` the same way in the strip and the panel header.
struct PinIconView: View {
    let icon: PinIconDisplay
    var fontSize: CGFloat = 16

    var body: some View {
        switch icon {
        case .emoji(let value):
            Text(value)
                .font(.system(size: fontSize))
        case .sfSymbol(let name, let colorHex):
            Image(systemName: name)
                .font(.system(size: fontSize - 2, weight: .medium))
                .foregroundStyle(SwiftUI.Color(hex: colorHex))
        case .letter(let text, let colorHex):
            Text(text)
                .font(.system(size: fontSize - 4, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: fontSize + 12, height: fontSize + 12)
                .background(SwiftUI.Color(hex: colorHex), in: Circle())
        }
    }
}
