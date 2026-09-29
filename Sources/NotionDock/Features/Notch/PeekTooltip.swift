import SwiftUI
import NotionKit

/// Small black card shown next to a hovered strip icon: title, "N open" and up to three
/// upcoming items with real checkboxes (ticking one marks it done in Notion).
struct PeekTooltip: View {
    let title: String
    let summary: PinSummary?
    var onCheck: (String) -> Void = { _ in }

    /// Ticked here but not yet gone from the refreshed summary.
    @State private var checkedIDs: Set<String> = []

    private var items: [PinSummary.ItemRef] {
        Array((summary?.nextRefs ?? []).prefix(3))
    }

    static func estimatedHeight(itemCount: Int) -> CGFloat {
        let scale = Settings.shared.size.fontScale
        return (44 + CGFloat(itemCount) * 20) * scale
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(Theme.Font.small.weight(.semibold))
                .foregroundStyle(Theme.Color.text)
                .lineLimit(1)
            Text(subtitle)
                .font(Theme.Font.caption)
                .foregroundStyle(Theme.Color.secondaryText)
            if !items.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(items, id: \.id) { item in
                        PeekItemRow(title: item.title, isChecked: checkedIDs.contains(item.id)) {
                            guard !checkedIDs.contains(item.id) else { return }
                            withAnimation(Theme.Motion.contents) { _ = checkedIDs.insert(item.id) }
                            onCheck(item.id)
                        }
                        .transition(Theme.Motion.rowTransition)
                    }
                }
                .animation(Theme.Motion.list, value: items.map(\.id))
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.Color.notch))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.Color.divider, lineWidth: 1))
    }

    private var subtitle: String {
        guard let summary else { return "Loading…" }
        if summary.total == 0 { return "No tasks" }
        return summary.openCount == 0 ? "All done" : "\(summary.openCount) open"
    }
}

private struct PeekItemRow: View {
    let title: String
    let isChecked: Bool
    let onCheck: () -> Void

    var body: some View {
        Button(action: onCheck) {
            HStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(isChecked ? Theme.Color.accent : .clear)
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(isChecked ? Theme.Color.accent : Theme.Color.checkboxBorder, lineWidth: 1)
                    if isChecked {
                        Image(systemName: "checkmark")
                            .font(.system(size: 7, weight: .bold))
                            .foregroundStyle(.white)
                            .transition(.scale(scale: 0.4).combined(with: .opacity))
                    }
                }
                .frame(width: 12, height: 12)
                Text(title)
                    .font(Theme.Font.small)
                    .foregroundStyle(isChecked ? Theme.Color.secondaryText : Theme.Color.text.opacity(0.9))
                    .strikethrough(isChecked)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .help(isChecked ? "Done" : "Mark done")
    }
}

