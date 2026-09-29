import SwiftUI
import NotionKit

struct MiniListView: View {
    let model: MiniListModel
    var onOpenInNotch: (String) -> Void
    var onSettings: () -> Void

    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            field
            Divider().overlay(Theme.Color.divider)
            ScrollView {
                LazyVStack(spacing: 2) {
                    let sections = model.sections
                    if sections.isEmpty {
                        Text(model.appModel.hasToken ? "No pins yet." : "Connect Notion in Settings.")
                            .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                            .padding(.top, 30)
                    }
                    ForEach(sections) { section in sectionView(section) }
                }
                .padding(8)
            }
            Divider().overlay(Theme.Color.divider)
            footer
        }
        .frame(width: 320, height: 440)
        .background(Theme.Color.background)
        .preferredColorScheme(.dark)
        .onAppear { fieldFocused = true }
    }

    private var field: some View {
        HStack(spacing: 8) {
            Image(systemName: "plus").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.Color.secondaryText)
            TextField(model.targetPin.map { "Add to \($0.title)…" } ?? "Add a to-do…", text: Binding(get: { model.query }, set: { model.query = $0 }))
                .textFieldStyle(.plain)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Color.text)
                .focused($fieldFocused)
                .onSubmit { model.quickAdd() }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private func sectionView(_ section: MiniListSection) -> some View {
        let pin = model.appModel.pinStore.pins.first { $0.id == section.pinID }
        let isOpen = model.expanded.contains(section.pinID)
        return VStack(spacing: 0) {
            Button { withAnimation(Theme.Motion.contents) { model.toggleExpanded(section.pinID) } } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.Color.tertiaryText).rotationEffect(.degrees(isOpen ? 90 : 0))
                    if let pin { PinIconView(icon: MiniListView.iconDisplay(pin), fontSize: 14).frame(width: 20) }
                    Text(section.title).font(Theme.Font.body).foregroundStyle(Theme.Color.text).lineLimit(1)
                    Spacer(minLength: 4)
                    let count = model.openCount(section)
                    if count > 0 {
                        Text("\(count)").font(Theme.Font.caption).foregroundStyle(Theme.Color.secondaryText)
                            .contentTransition(.numericText())
                    }
                }
                .padding(.horizontal, 8).frame(height: Theme.Metrics.rowHeight)
                .background(section.pinID == model.targetPin?.id ? Theme.Color.hover.opacity(0.5) : .clear, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .contentShape(Rectangle())
            }
            .buttonStyle(.notion)
            if isOpen, let pin {
                let rows = model.visibleItems(section.pinID)
                if rows.isEmpty {
                    Text(model.loading.contains(section.pinID) ? "Loading…" : "Nothing open")
                        .font(Theme.Font.small).foregroundStyle(Theme.Color.tertiaryText)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 36).padding(.vertical, 6)
                }
                ForEach(rows) { item in
                    HStack(spacing: 8) {
                        NotionCheckbox(isDone: false) { model.check(item, in: pin) }
                        Text(item.title).font(Theme.Font.body).foregroundStyle(Theme.Color.text).lineLimit(2)
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, 28).padding(.trailing, 8).padding(.vertical, 4)
                    .transition(.opacity.combined(with: .move(edge: .leading)))
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("Open in notch") {
                if let id = model.targetPin?.id { onOpenInNotch(id) }
            }
            .disabled(model.targetPin == nil)
            Spacer()
            if let message = model.message {
                Text(message).font(Theme.Font.small).foregroundStyle(Theme.Color.danger).lineLimit(1)
                Spacer()
            }
            Button("Settings…", action: onSettings)
        }
        .buttonStyle(.notion)
        .font(Theme.Font.small)
        .foregroundStyle(Theme.Color.secondaryText)
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    static func iconDisplay(_ pin: Pin) -> PinIconDisplay {
        if let custom = pin.customIcon {
            switch custom {
            case .emoji(let v): return .emoji(v)
            case .sfSymbol(let n, let c): return .sfSymbol(name: n, colorHex: c)
            case .letter(let t, let c): return .letter(text: t, colorHex: c)
            }
        }
        if case .emoji(let v) = pin.icon { return .emoji(v) }
        let t = pin.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return .emoji(t.first.map { String($0).uppercased() } ?? "•")
    }
}
