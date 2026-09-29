import SwiftUI

struct PanelView: View {
    let pin: PinItem
    let content: AnyView
    let isPinned: Bool
    let onTogglePin: () -> Void
    let onClose: () -> Void
    var onOpenInNotion: (() -> Void)? = nil
    var onChangeIcon: (() -> Void)? = nil

    var body: some View {
        // No background/border/fixed frame of its own: it's embedded directly inside the
        // black notch shape, which supplies the surface, and fills whatever space the
        // notch's expanded content area gives it.
        VStack(spacing: 0) {
            header
            Rectangle()
                .fill(Theme.Color.divider)
                .frame(height: 1)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(.opacity.animation(Theme.Motion.crossfade))
                .id(pin.id)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var header: some View {
        HStack(spacing: 8) {
            if let onChangeIcon {
                Button(action: onChangeIcon) {
                    PinIconView(icon: pin.icon, fontSize: 15)
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.notion)
                .focusEffectDisabled()
                .notionHover()
                .help("Change icon")
            } else {
                PinIconView(icon: pin.icon, fontSize: 15)
            }
            Text(pin.title)
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)
            Spacer()

            if let onOpenInNotion {
                HeaderIconButton(systemName: "arrow.up.right.square", help: "Open in Notion", action: onOpenInNotion)
            }

            HeaderIconButton(systemName: isPinned ? "pin.fill" : "pin", help: "Keep panel open", action: onTogglePin)
            HeaderIconButton(systemName: "xmark", help: "Close", action: onClose)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

private struct HeaderIconButton: View {
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
