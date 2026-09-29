import SwiftUI

/// The 16x16 Notion-style checkbox used in task rows and to-do blocks.
/// Extracted so PageView can reuse it without touching PanelView/TaskRowView.
struct NotionCheckbox: View {
    var isDone: Bool
    var action: () -> Void

    var body: some View {
        Button(action: {
            if !isDone { SoundService.shared.tick() }
            action()
        }) {
            ZStack {
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(Theme.Color.checkboxBorder, lineWidth: 1.5)
                    .background(
                        RoundedRectangle(cornerRadius: 3)
                            .fill(isDone ? Theme.Color.accent : .clear)
                    )
                    .frame(width: 16, height: 16)

                if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
            }
            .scaleEffect(isDone ? 1 : 0.94)
            .animation(Theme.Motion.contents, value: isDone)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
    }
}
