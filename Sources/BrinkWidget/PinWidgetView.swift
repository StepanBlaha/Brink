import SwiftUI
import WidgetKit
import AppIntents

enum BrinkStyle {
    static let accent = Color(red: 10 / 255, green: 132 / 255, blue: 1)
    static let secondary = Color.white.opacity(0.55)
    static let hairline = Color.white.opacity(0.12)
}

struct PinWidgetView: View {
    let entry: PinWidgetEntry
    @Environment(\.widgetFamily) private var family

    private var limit: Int {
        switch family {
        case .systemSmall: return 2
        case .systemMedium: return 3
        default: return 7
        }
    }

    var body: some View {
        content
            .foregroundStyle(.white)
            .containerBackground(for: .widget) { Color.black }
            .widgetURL(entry.pinID.flatMap(SharedContainer.pinURL))
    }

    @ViewBuilder private var content: some View {
        if entry.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                header
                Spacer(minLength: 0)
                Text("Open Brink and pin a Notion page to see it here.")
                    .font(.caption)
                    .foregroundStyle(BrinkStyle.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else if family == .systemSmall {
            small
        } else {
            list
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(entry.icon).font(.system(size: 13))
            Text(entry.title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
            Spacer(minLength: 4)
            if entry.dueToday > 0 {
                Text("\(entry.dueToday) today")
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Capsule().fill(BrinkStyle.accent.opacity(0.25)))
                    .foregroundStyle(BrinkStyle.accent)
            }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            header
            Text("\(entry.openCount)")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            Text(entry.openCount == 1 ? "open item" : "open items")
                .font(.caption2)
                .foregroundStyle(BrinkStyle.secondary)
            Spacer(minLength: 2)
            ForEach(entry.items.prefix(limit)) { item in
                HStack(spacing: 5) {
                    Circle().fill(item.checked ? BrinkStyle.secondary : BrinkStyle.accent).frame(width: 5, height: 5)
                    Text(item.title).font(.system(size: 11)).lineLimit(1)
                        .strikethrough(item.checked)
                        .foregroundStyle(item.checked ? BrinkStyle.secondary : .white)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: family == .systemLarge ? 8 : 6) {
            HStack {
                header
                Text("\(entry.openCount)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(BrinkStyle.accent)
            }
            Rectangle().fill(BrinkStyle.hairline).frame(height: 1)
            if entry.items.isEmpty {
                Spacer(minLength: 0)
                Text("All done ✓").font(.callout).foregroundStyle(BrinkStyle.secondary)
                    .frame(maxWidth: .infinity)
            }
            ForEach(entry.items.prefix(limit)) { item in
                ItemRow(item: item)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct ItemRow: View {
    let item: WidgetSnapshot.Item

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: ToggleItemIntent(item: item)) {
                ZStack {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(item.checked ? BrinkStyle.accent : Color.white.opacity(0.45), lineWidth: 1.3)
                        .background(RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(item.checked ? BrinkStyle.accent : .clear))
                    if item.checked {
                        Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                    }
                }
                .frame(width: 15, height: 15)
            }
            .buttonStyle(.plain)
            Link(destination: SharedContainer.pinURL(item.pinId) ?? URL(string: "brink://")!) {
                Text(item.title)
                    .font(.system(size: 12.5))
                    .lineLimit(1)
                    .strikethrough(item.checked)
                    .foregroundStyle(item.checked ? BrinkStyle.secondary : .white)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
