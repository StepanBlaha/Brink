import SwiftUI
import NotionKit

struct PinSearchView: View {
    let appModel: AppModel
    let onPick: (SearchResult) -> Void
    let onClose: () -> Void
    /// `false` when a parent (`AddPinView`) draws the header and the source switch.
    var showsHeader = true

    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedIndex = 0
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var searchFieldFocused: Bool

    private var pinnedIDs: Set<String> {
        Set(appModel.pinStore.pins.map(\.notionId))
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsHeader { AddFlowHeader(title: "Add a pin", onClose: onClose) }
            searchField
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            searchFieldFocused = true
            runSearch()
        }
        .onChange(of: query) { _, _ in scheduleSearch() }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.secondaryText)
            TextField("Search Notion…", text: $query)
                .textFieldStyle(.plain)
                .font(Theme.Font.body)
                .focused($searchFieldFocused)
                .onKeyPress(.downArrow) { moveSelection(1); return .handled }
                .onKeyPress(.upArrow) { moveSelection(-1); return .handled }
                .onKeyPress(.return) { pickSelected(); return .handled }
        }
        .padding(.horizontal, 8)
        .frame(height: 30)
        .background(RoundedRectangle(cornerRadius: Theme.Metrics.radius + 2).fill(Color.white.opacity(0.08)))
        .padding(.horizontal, Theme.Metrics.hPadding)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && results.isEmpty && errorMessage == nil {
            centered { ProgressView() }
        } else if let errorMessage {
            centered {
                Text(errorMessage)
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.danger)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
        } else if results.isEmpty {
            centered {
                Text("Not seeing a page? Share it with your integration in Notion (••• → Connections).")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                        resultRow(result, isSelected: index == selectedIndex, isPinned: pinnedIDs.contains(result.id))
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedIndex = index
                                onPick(result)
                            }
                    }
                }
                .padding(.horizontal, 6)
                .padding(.bottom, 6)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func centered<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack {
            Spacer()
            content()
            Spacer()
        }
    }

    private func resultRow(_ result: SearchResult, isSelected: Bool, isPinned: Bool) -> some View {
        HStack(spacing: 8) {
            iconView(result.icon, kind: result.kind)
                .frame(width: 18, height: 18)

            Text(result.title.isEmpty ? "Untitled" : result.title)
                .font(Theme.Font.body)
                .foregroundStyle(Theme.Color.text)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(0)

            Spacer(minLength: 4)

            Text(result.kind == .dataSource ? "Database" : "Page")
                .font(Theme.Font.caption)
                .foregroundStyle(Theme.Color.secondaryText)
                .lineLimit(1)
                .fixedSize()

            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.accent)
                .frame(width: 12)
                .opacity(isPinned ? 1 : 0)
        }
        .padding(.horizontal, 6)
        .frame(height: Theme.Metrics.rowHeight)
        .notionHover(selected: isSelected)
    }

    @ViewBuilder
    private func iconView(_ icon: Icon, kind: SearchResult.Kind) -> some View {
        switch icon {
        case .emoji(let value):
            Text(value).font(.system(size: 14))
        default:
            Image(systemName: kind == .dataSource ? "cylinder.split.1x2" : "doc.text")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.secondaryText)
        }
    }

    private func moveSelection(_ delta: Int) {
        guard !results.isEmpty else { return }
        selectedIndex = max(0, min(results.count - 1, selectedIndex + delta))
    }

    private func pickSelected() {
        guard results.indices.contains(selectedIndex) else { return }
        onPick(results[selectedIndex])
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let task = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await performSearch()
        }
        searchTask = task
    }

    private func runSearch() {
        searchTask?.cancel()
        searchTask = Task { await performSearch() }
    }

    private func performSearch() async {
        isLoading = true
        errorMessage = nil
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let found = try await appModel.client.search(query: trimmed.isEmpty ? nil : trimmed)
            guard !Task.isCancelled else { return }
            results = found
            selectedIndex = 0
            isLoading = false
        } catch {
            guard !Task.isCancelled else { return }
            results = []
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Search failed."
            isLoading = false
        }
    }
}
