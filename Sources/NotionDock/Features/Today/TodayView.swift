import SwiftUI
import NotionKit

/// The Today panel: every open item due today or overdue across the database pins, by pin.
struct TodayView: View {
    let model: TodayModel

    var body: some View {
        let sections = model.visibleSections
        VStack(alignment: .leading, spacing: 0) {
            header
            if sections.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(sections) { section in
                            VStack(alignment: .leading, spacing: 0) {
                                Text(section.pinTitle)
                                    .font(Theme.Font.caption)
                                    .foregroundStyle(Theme.Color.secondaryText)
                                    .padding(.horizontal, Theme.Metrics.hPadding)
                                    .padding(.bottom, 2)
                                ForEach(section.items) { item in
                                    TodayRow(item: item, isChecked: model.checkedIDs.contains(item.id),
                                             onToggle: { model.toggleDone(item) }, onSnooze: { model.snooze(item, $0) })
                                        .transition(Theme.Motion.rowTransition)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    .animation(Theme.Motion.list, value: sections.flatMap { $0.items.map(\.id) })
                }
            }
        }
        .task {
            // Fresh data whenever the panel is open: refresh now, then every 30 s.
            while !Task.isCancelled {
                PinSummaryService.shared.refreshAll(stagger: 0.1)
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
        .onChange(of: model.digest.items.map(\.id)) { _, _ in model.prune() }
    }

    private var header: some View {
        HStack {
            Text("Today \u{00B7} \(model.openCount) open")
                .font(Theme.Font.body.weight(.semibold))
                .foregroundStyle(Theme.Color.text)
            Spacer()
        }
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.vertical, 8)
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Text("No tasks due today")
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Color.secondaryText)
            if !PinSummaryService.shared.hasDatabasePins {
                Text("Pin a database with a date property and its tasks show up here.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.tertiaryText)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
    }
}

private struct TodayRow: View {
    let item: TodayItem
    let isChecked: Bool
    let onToggle: () -> Void
    let onSnooze: (SnoozeOption) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onToggle) { checkbox }
                .buttonStyle(.notion)
                .focusEffectDisabled()

            Text(item.title)
                .font(Theme.Font.body)
                .strikethrough(isChecked)
                .foregroundStyle(isChecked ? Theme.Color.secondaryText : Theme.Color.text)
                .lineLimit(1)

            Spacer(minLength: 8)

            Text(dateLabel)
                .font(Theme.Font.small)
                .foregroundStyle(item.isOverdue ? Theme.Color.danger : Theme.Color.secondaryText)
                .fixedSize()

            Menu {
                Button("Later today (+3h)") { onSnooze(.laterToday) }.disabled(!item.hasTime)
                Button("Tomorrow") { onSnooze(.tomorrow) }
                Button("Next week (Monday)") { onSnooze(.nextWeek) }
            } label: {
                Image(systemName: "moon.zzz")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.secondaryText)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .help("Snooze")
        }
        .padding(.horizontal, Theme.Metrics.hPadding)
        .frame(height: Theme.Metrics.rowHeight)
        .notionHover()
    }

    private var checkbox: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3)
                .strokeBorder(item.isOverdue && !isChecked ? Theme.Color.danger.opacity(0.8) : Theme.Color.checkboxBorder, lineWidth: 1.5)
                .background(RoundedRectangle(cornerRadius: 3).fill(isChecked ? Theme.Color.accent : .clear))
                .frame(width: 16, height: 16)
            if isChecked {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }

    private var dateLabel: String {
        let calendar = Calendar.current
        let time = item.hasTime ? item.due.formatted(date: .omitted, time: .shortened) : nil
        let day: String?
        if calendar.isDateInToday(item.due) {
            day = item.hasTime ? nil : "Today"
        } else if calendar.isDateInYesterday(item.due) {
            day = "Yesterday"
        } else {
            let f = DateFormatter()
            f.dateFormat = "EEE d MMM"
            day = f.string(from: item.due)
        }
        return [day, time].compactMap { $0 }.joined(separator: " ")
    }
}
