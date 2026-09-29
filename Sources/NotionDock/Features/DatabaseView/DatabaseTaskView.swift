import SwiftUI
import Observation
import NotionKit

/// Notion-styled task list for a database: quick-add, checkbox/status rows, date chips,
/// and a "show completed" toggle. Used both as a pinned panel's body and embedded inside a page.
struct DatabaseTaskView: View {
    @Bindable var model: DatabaseViewModel
    var compact: Bool = false

    @State private var newTaskTitle = ""
    @State private var showAllInCompact = false

    private let compactRowLimit = 8

    private var visibleRows: [Row] {
        compact && !showAllInCompact ? Array(model.rows.prefix(compactRowLimit)) : model.rows
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if compact {
                Text(model.schema?.name ?? "Tasks")
                    .font(Theme.Font.caption)
                    .foregroundStyle(Theme.Color.secondaryText)
                    .padding(.horizontal, Theme.Metrics.hPadding)
                    .padding(.top, 4)
                    .padding(.bottom, 6)
            }

            quickAddRow

            if let errorMessage = model.errorMessage {
                errorBanner(errorMessage)
            }

            content
        }
        .task {
            await model.load()
            if !compact {
                model.startPolling()
            }
        }
        .onDisappear {
            if !compact {
                model.stopPolling()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.rows.isEmpty {
            HStack {
                Spacer()
                ProgressView()
                    .controlSize(.small)
                Spacer()
            }
            .padding(.vertical, 24)
        } else if model.rows.isEmpty {
            emptyState
        } else if compact {
            rowList
        } else {
            ScrollView {
                rowList
            }
        }
    }

    private var rowList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(visibleRows) { row in
                DatabaseRowView(model: model, row: row)
                    .opacity(model.isAnimatingOut(row.id) ? 0 : 1)
                    .offset(x: model.isAnimatingOut(row.id) ? 8 : 0)
                    .animation(Theme.Motion.list, value: model.isAnimatingOut(row.id))
                    .transition(Theme.Motion.rowTransition)
            }
            .animation(Theme.Motion.list, value: visibleRows.map(\.id))

            if compact, !showAllInCompact, model.rows.count > compactRowLimit {
                Button {
                    showAllInCompact = true
                } label: {
                    Text("Show all \(model.rows.count)")
                        .font(Theme.Font.small)
                        .foregroundStyle(Theme.Color.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.notion)
                .focusEffectDisabled()
                .padding(.horizontal, Theme.Metrics.hPadding)
                .padding(.vertical, 6)
            }

            if !model.isReadOnly {
                showCompletedToggle
            }
        }
    }

    private var quickAddRow: some View {
        HStack(spacing: 8) {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.tertiaryText)

            TextField("Add a task", text: $newTaskTitle)
                .textFieldStyle(.plain)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Color.text)
                .onSubmit {
                    let title = newTaskTitle
                    newTaskTitle = ""
                    Task { await model.quickAdd(title) }
                }
        }
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.vertical, 8)
    }

    private var showCompletedToggle: some View {
        Button {
            model.showDone.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: model.showDone ? "checkmark.square.fill" : "square")
                    .font(.system(size: 11))
                Text("Show completed")
                    .font(Theme.Font.small)
            }
            .foregroundStyle(Theme.Color.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }

    private var emptyState: some View {
        VStack {
            Text("No open tasks 🎉")
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Color.secondaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, compact ? 16 : 32)
    }

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.bottom, 6)
    }
}

private struct DatabaseRowView: View {
    let model: DatabaseViewModel
    let row: Row

    @State private var titleText: String
    @State private var showDatePopover = false

    init(model: DatabaseViewModel, row: Row) {
        self.model = model
        self.row = row
        _titleText = State(initialValue: row.title)
    }

    private var isDone: Bool { model.isDone(row) }

    var body: some View {
        HStack(spacing: 8) {
            if !model.isReadOnly {
                Button {
                    Task { await model.toggleDone(row.id) }
                } label: {
                    checkbox
                }
                .buttonStyle(.notion)
                .focusEffectDisabled()
            }

            TextField("", text: $titleText)
                .textFieldStyle(.plain)
                .font(Theme.Font.body)
                .strikethrough(isDone)
                .foregroundStyle(isDone ? Theme.Color.secondaryText : Theme.Color.text)
                .onSubmit {
                    Task { await model.rename(row.id, title: titleText) }
                }
                .onChange(of: row.title) { _, newValue in
                    titleText = newValue
                }

            Spacer(minLength: 8)

            if let statusName = model.statusName(row) {
                statusPill(statusName)
            }

            if model.config?.dateProperty != nil {
                dateChip
            }
        }
        .padding(.horizontal, Theme.Metrics.hPadding)
        .frame(height: Theme.Metrics.rowHeight)
        .notionHover()
        .contextMenu { snoozeMenu }
    }

    private var snoozeMenu: some View {
        let hasDate = model.config?.dateProperty != nil
        return Menu("Snooze") {
            Button("Later today (+3h)") { Task { await model.snooze(row.id, .laterToday) } }
                .disabled(!model.dateHasTime(row))
            Button("Tomorrow") { Task { await model.snooze(row.id, .tomorrow) } }
            Button("Next week (Monday)") { Task { await model.snooze(row.id, .nextWeek) } }
            Divider()
            Button("Pick date…") { showDatePopover = true }
        }
        .disabled(!hasDate)
    }

    private var checkbox: some View {
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
            }
        }
    }

    private func statusPill(_ name: String) -> some View {
        Text(name)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.secondaryText)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Theme.Color.sidebar)
            )
            .fixedSize()
    }

    private var dateChip: some View {
        let date = model.date(row)
        let isOverdue = date.map { $0 < Calendar.current.startOfDay(for: Date()) } ?? false

        return Button {
            showDatePopover = true
        } label: {
            Text(date.map { Self.formattedLabel($0) + (model.dateHasTime(row) ? " " + Self.timeLabel($0) : "") } ?? "Date")
                .font(Theme.Font.small)
                .foregroundStyle(isOverdue ? Theme.Color.danger : Theme.Color.secondaryText)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .disabled(model.isReadOnly && model.config?.dateProperty == nil)
        .popover(isPresented: $showDatePopover) {
            DatePickerPopover(initialDate: date) { newDate in
                Task { await model.setDate(row.id, date: newDate, hasTime: model.dateHasTime(row)) }
            }
        }
    }

    private static func timeLabel(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    private static func formattedLabel(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE d MMM"
        return formatter.string(from: date)
    }
}

private struct DatePickerPopover: View {
    let initialDate: Date?
    let onChange: (Date?) -> Void

    @State private var selection: Date

    init(initialDate: Date?, onChange: @escaping (Date?) -> Void) {
        self.initialDate = initialDate
        self.onChange = onChange
        _selection = State(initialValue: initialDate ?? Date())
    }

    var body: some View {
        VStack(spacing: 8) {
            DatePicker("", selection: $selection, displayedComponents: [.date])
                .datePickerStyle(.graphical)
                .labelsHidden()
                .onChange(of: selection) { _, newValue in
                    onChange(newValue)
                }

            Button("Clear") {
                onChange(nil)
            }
            .buttonStyle(.notion)
            .focusEffectDisabled()
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.secondaryText)
        }
        .padding(12)
    }
}
