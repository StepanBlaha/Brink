import SwiftUI
import NotionKit

/// Editor for a pinned database's saved view: a name, AND-combined filters, sorts, and
/// "Show completed". Embedded (collapsed by default) in `DatabaseSetupView`.
struct ViewBuilderSection: View {
    let schema: DataSourceSchema
    @Binding var viewName: String
    @Binding var filters: [ViewFilter]
    @Binding var sorts: [ViewSort]
    @Binding var showDone: Bool

    private static let filterTypes: Set<String> = ["checkbox", "status", "select", "date", "title", "number"]
    private static let sortTypes: Set<String> = ["title", "date", "number", "select", "status", "checkbox", "rich_text", "created_time", "last_edited_time"]

    private var filterProperties: [PropertySchema] {
        schema.properties.filter { Self.filterTypes.contains($0.type) }
    }
    private var sortProperties: [PropertySchema] {
        schema.properties.filter { Self.sortTypes.contains($0.type) }
    }
    private func property(named name: String) -> PropertySchema? {
        schema.properties.first { $0.name == name }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                label("View name")
                TextField("e.g. This week", text: $viewName)
                    .textFieldStyle(.plain)
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.text)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(fieldBackground)
            }

            VStack(alignment: .leading, spacing: 6) {
                label("Filters (all must match)")
                ForEach($filters) { $filter in
                    filterRow($filter)
                        .transition(Theme.Motion.rowTransition)
                }
                addButton("Add filter", disabled: filterProperties.isEmpty, action: addFilter)
            }

            VStack(alignment: .leading, spacing: 6) {
                label("Sort")
                ForEach($sorts) { $sort in
                    sortRow($sort)
                        .transition(Theme.Motion.rowTransition)
                }
                addButton("Add sort", disabled: sortProperties.isEmpty, action: addSort)
            }

            Toggle(isOn: $showDone) {
                Text("Show completed")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.text)
            }
            .toggleStyle(.switch)
            .controlSize(.small)
        }
        .animation(Theme.Motion.list, value: filters.map(\.id))
        .animation(Theme.Motion.list, value: sorts.map(\.id))
    }

    // MARK: - Rows

    private func filterRow(_ filter: Binding<ViewFilter>) -> some View {
        let current = filter.wrappedValue
        let prop = property(named: current.property)
        let ops = ViewFilterOperator.operators(forPropertyType: prop?.type ?? current.op.propertyType)
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                pill(current.property.isEmpty ? "Property" : current.property) {
                    ForEach(filterProperties) { p in
                        Button(p.name) { changeProperty(filter, to: p) }
                    }
                }
                pill(current.op.displayName) {
                    ForEach(ops, id: \.self) { op in
                        Button(op.displayName) { changeOperator(filter, to: op) }
                    }
                }
                Spacer(minLength: 0)
                removeButton { filters.removeAll { $0.id == current.id } }
            }
            if current.op.needsValue {
                valueEditor(filter, property: prop)
            }
        }
        .padding(8)
        .background(fieldBackground)
    }

    @ViewBuilder
    private func valueEditor(_ filter: Binding<ViewFilter>, property: PropertySchema?) -> some View {
        let op = filter.wrappedValue.op
        if op.propertyType == "status" || op.propertyType == "select" {
            let options = (op.propertyType == "status" ? property?.statusOptions : property?.selectOptions) ?? []
            FlowLayout(spacing: 4) {
                ForEach(options) { option in
                    let selected = filter.wrappedValue.optionValues?.contains(option.name) ?? false
                    Button {
                        toggleOption(option.name, in: filter, multiple: op.needsMultipleOptions)
                    } label: {
                        Text(option.name)
                            .font(Theme.Font.caption)
                            .lineLimit(1)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .foregroundStyle(selected ? Color.white : Theme.Color.secondaryText)
                            .background(Capsule().fill(selected ? Theme.Color.accent : Theme.Color.hover))
                    }
                    .buttonStyle(.notion)
                }
            }
            if options.isEmpty {
                Text("No options").font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
            }
        } else if op.propertyType == "number" {
            NumberValueField(value: filter.numberValue)
        } else if op.propertyType == "title" {
            TextField("Text", text: Binding(
                get: { filter.wrappedValue.textValue ?? "" },
                set: { filter.wrappedValue.textValue = $0 }
            ))
            .textFieldStyle(.plain)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.text)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius).fill(Theme.Color.hover))
        }
    }

    private func sortRow(_ sort: Binding<ViewSort>) -> some View {
        let current = sort.wrappedValue
        return HStack(spacing: 6) {
            pill(current.property.isEmpty ? "Property" : current.property) {
                ForEach(sortProperties) { p in
                    Button(p.name) { sort.wrappedValue.property = p.name }
                }
            }
            pill(current.ascending ? "Ascending" : "Descending") {
                Button("Ascending") { sort.wrappedValue.ascending = true }
                Button("Descending") { sort.wrappedValue.ascending = false }
            }
            Spacer(minLength: 0)
            removeButton { sorts.removeAll { $0.id == current.id } }
        }
        .padding(8)
        .background(fieldBackground)
    }

    // MARK: - Mutations

    private func addFilter() {
        guard let p = filterProperties.first else { return }
        let op = ViewFilterOperator.operators(forPropertyType: p.type).first ?? .titleContains
        filters.append(ViewFilter(property: p.name, op: op))
    }

    private func addSort() {
        guard let p = sortProperties.first else { return }
        sorts.append(ViewSort(property: p.name, ascending: true))
    }

    private func changeProperty(_ filter: Binding<ViewFilter>, to p: PropertySchema) {
        guard filter.wrappedValue.property != p.name else { return }
        var f = filter.wrappedValue
        f.property = p.name
        f.op = ViewFilterOperator.operators(forPropertyType: p.type).first ?? f.op
        f.textValue = nil; f.numberValue = nil; f.optionValues = nil
        filter.wrappedValue = f
    }

    private func changeOperator(_ filter: Binding<ViewFilter>, to op: ViewFilterOperator) {
        var f = filter.wrappedValue
        f.op = op
        if !op.needsMultipleOptions, let first = f.optionValues?.first { f.optionValues = [first] }
        filter.wrappedValue = f
    }

    private func toggleOption(_ name: String, in filter: Binding<ViewFilter>, multiple: Bool) {
        var values = filter.wrappedValue.optionValues ?? []
        if multiple {
            if let i = values.firstIndex(of: name) { values.remove(at: i) } else { values.append(name) }
        } else {
            values = values == [name] ? [] : [name]
        }
        filter.wrappedValue.optionValues = values
    }

    // MARK: - Pieces

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: Theme.Metrics.radius + 2).fill(Color.white.opacity(0.06))
    }

    private func label(_ text: String) -> some View {
        Text(text).font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
    }

    private func pill<Items: View>(_ title: String, @ViewBuilder items: () -> Items) -> some View {
        Menu {
            items()
        } label: {
            HStack(spacing: 3) {
                Text(title).lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 8))
            }
            .font(Theme.Font.caption)
            .foregroundStyle(Theme.Color.text)
            .padding(.horizontal, 7).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius).fill(Theme.Color.hover))
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
    }

    private func removeButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark").font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.Color.secondaryText)
                .frame(width: 20, height: 20)
        }
        .buttonStyle(.notion)
        .help("Remove")
    }

    private func addButton(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text("+ \(title)").font(Theme.Font.small).foregroundStyle(Theme.Color.accent)
        }
        .buttonStyle(.notion)
        .disabled(disabled)
    }
}

/// Number entry that keeps its own text so partial input like "1." isn't clobbered.
private struct NumberValueField: View {
    @Binding var value: Double?
    @State private var text = ""

    var body: some View {
        TextField("Number", text: $text)
            .textFieldStyle(.plain)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.text)
            .padding(.horizontal, 8).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius).fill(Theme.Color.hover))
            .onAppear { text = value.map { $0.formatted(.number.grouping(.never)) } ?? "" }
            .onChange(of: text) { _, new in
                let trimmed = new.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
                value = Double(trimmed)
            }
    }
}

/// Minimal wrapping row layout for option chips.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? 300, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (i, origin) in result.origins.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: maxX, height: y + rowHeight), origins)
    }
}
