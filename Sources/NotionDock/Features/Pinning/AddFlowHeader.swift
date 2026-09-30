import SwiftUI

/// Header shared by the add-a-pin steps; mirrors `PanelView`'s header (12pt padding, 24pt
/// icon buttons, title font) followed by a hairline divider.
struct AddFlowHeader: View {
    let title: String
    var onBack: (() -> Void)? = nil
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if let onBack {
                    AddFlowIconButton(systemName: "chevron.left", help: "Back", action: onBack)
                }
                Text(title)
                    .font(Theme.Font.title)
                    .foregroundStyle(Theme.Color.text)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 8)
                AddFlowIconButton(systemName: "xmark", help: "Close", action: onClose)
            }
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.vertical, 10)
            Rectangle().fill(Theme.Color.divider).frame(height: 1)
        }
    }
}

struct AddFlowIconButton: View {
    let systemName: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.secondaryText)
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .notionHover()
        .help(help)
    }
}
