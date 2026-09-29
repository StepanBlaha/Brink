import SwiftUI
import NotionKit

struct QuickCaptureView: View {
    @Bindable var model: QuickCaptureModel
    var visible: Bool
    var focusToken: Int
    var onSubmit: (_ keepOpen: Bool) -> Void
    var onCancel: () -> Void

    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                destinationChip
                TextField("Add to…", text: $model.text)
                    .textFieldStyle(.plain)
                    .font(.system(size: 17 * Settings.shared.size.fontScale))
                    .foregroundStyle(Theme.Color.text)
                    .focused($focused)
                    .onSubmit { onSubmit(NSEvent.modifierFlags.contains(.command)) }
                    .disabled(model.isSaving)
                if let preview = model.datePreview, let date = preview.date {
                    dateChip(date, hasTime: preview.hasTime)
                        .transition(.scale(scale: 0.85).combined(with: .opacity))
                }
            }
            if let error = model.errorMessage {
                Text(error)
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.danger)
                    .lineLimit(2)
            }
        }
        .animation(Theme.Motion.contents, value: model.datePreview?.date)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(width: 520, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.Color.background))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.Color.divider, lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 32)
        .frame(maxHeight: .infinity, alignment: .top)
        .scaleEffect(visible ? 1 : 0.94, anchor: .top)
        .opacity(visible ? 1 : 0)
        .animation(Theme.Motion.contents, value: visible)
        .onExitCommand(perform: onCancel)
        .onChange(of: focusToken) { _, _ in focused = true }
        .task { try? await Task.sleep(nanoseconds: 60_000_000); focused = true }
    }

    private var destinationChip: some View {
        Menu {
            if model.pins.isEmpty {
                Text("No pins yet")
            }
            ForEach(model.pins) { pin in
                Button {
                    model.destinationID = pin.id
                    Task { await model.resolveDateProperty() }
                } label: {
                    Text("\(pin.kind == .page ? "" : "☰ ")\(pin.title)")
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: model.destination?.kind == .dataSource ? "list.bullet.rectangle" : "doc.text")
                    .font(.system(size: 11))
                Text(model.destination?.title ?? "Choose")
                    .font(Theme.Font.small.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 8, weight: .bold))
            }
            .foregroundStyle(Theme.Color.secondaryText)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.Color.hover))
            .frame(maxWidth: 150)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    private func dateChip(_ date: Date, hasTime: Bool) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "calendar").font(.system(size: 10))
            Text(Self.label(date, hasTime: hasTime)).font(Theme.Font.small.weight(.medium))
        }
        .foregroundStyle(Theme.Color.accent)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(Theme.Color.accent.opacity(0.16)))
        .fixedSize()
    }

    private static func label(_ date: Date, hasTime: Bool) -> String {
        let cal = Calendar.current
        var day: String
        if cal.isDateInToday(date) { day = "Today" }
        else if cal.isDateInTomorrow(date) { day = "Tomorrow" }
        else { day = date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) }
        if hasTime { day += " " + date.formatted(date: .omitted, time: .shortened) }
        return day
    }
}
