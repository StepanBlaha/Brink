import SwiftUI
import AppKit
import NotionKit

/// A full-page, live-preview Markdown editor for a pinned Notion page (BRIEF §4.4, reworked):
/// one paragraph per Notion block — type anywhere, Enter makes a new block, empty lines are
/// empty blocks — backed by `MarkdownEditorView` (an NSTextView over `EditorDocument`) and synced
/// by exact block identity through `PageViewModel`/`PageEditorEngine`. `embed` is kept for API compatibility with `DockController` but is currently unused:
/// non-Markdown blocks (databases, subpages, toggles, callouts, unsupported) render as a small
/// chip that opens the block in Notion instead of expanding inline.
struct PageView: View {
    let model: PageViewModel
    var embed: (String, String) -> AnyView = { id, title in
        AnyView(EmptyView())
    }

    var body: some View {
        VStack(spacing: 0) {
            if let errorMessage = model.errorMessage, model.isDocumentEmpty, !model.hasLoaded {
                errorState(errorMessage)
            } else {
                content
            }
        }
        .task {
            await model.load()
            model.startPolling()
        }
        .onDisappear {
            model.stopPolling()
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            if let cover = model.cover {
                CoverStrip(cover: cover, refresh: model.refreshCover)
            }
            if model.find.isVisible {
                FindBar(controller: model.find)
            }
            ZStack(alignment: .topLeading) {
                MarkdownEditorView(
                    document: model.document,
                    find: model.find,
                    isEditable: model.hasLoaded,
                    onOpenToken: { openInNotion(blockId: $0) },
                    onInsertImage: { model.insertImage($0, afterParagraphAt: $1) }
                )
                if model.isLoading && model.isDocumentEmpty {
                    ProgressView()
                        .padding(.top, 20)
                        .frame(maxWidth: .infinity)
                }
            }
            footer
        }
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Theme.Color.divider).frame(height: 1)
            HStack(spacing: 8) {
                if let hint = model.restoredTokenHint {
                    Text(hint)
                        .font(Theme.Font.caption)
                        .foregroundStyle(Theme.Color.danger)
                } else if let errorMessage = model.errorMessage, !model.isDocumentEmpty || model.hasLoaded {
                    Text(errorMessage)
                        .font(Theme.Font.caption)
                        .foregroundStyle(Theme.Color.danger)
                } else {
                    Text(model.syncStatus.label)
                        .font(Theme.Font.caption)
                        .foregroundStyle(statusColor)
                }
                Spacer()
                if let count = model.pendingMassDelete {
                    Button("Delete \(count) blocks in Notion") { model.confirmMassDelete() }
                        .buttonStyle(.notion)
                        .font(Theme.Font.caption)
                        .foregroundStyle(Theme.Color.danger)
                        .focusEffectDisabled()
                }
            }
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.vertical, 6)
        }
        .background(Theme.Color.background)
    }

    private var statusColor: Color {
        switch model.syncStatus {
        case .saved: return Theme.Color.secondaryText
        case .saving: return Theme.Color.secondaryText
        case .offline: return Theme.Color.tertiaryText
        case .error: return Theme.Color.danger
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(Theme.Color.secondaryText)
            Text(message)
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }

    /// Opens a token chip's underlying block (database, subpage, toggle, …) directly in Notion.
    private func openInNotion(blockId: String) {
        let compactID = blockId.replacingOccurrences(of: "-", with: "")
        let notionSchemeURL = URL(string: "notion://www.notion.so/\(compactID)")
        let httpsURL = URL(string: "https://www.notion.so/\(compactID)")
        if let notionSchemeURL, NSWorkspace.shared.urlForApplication(toOpen: URL(string: "notion://")!) != nil {
            NSWorkspace.shared.open(notionSchemeURL)
        } else if let httpsURL {
            NSWorkspace.shared.open(httpsURL)
        }
    }
}
