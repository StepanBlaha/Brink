import SwiftUI
import NotionKit

/// Shows a list and, when a row is opened, that row's page in its place with a back header.
/// The list stays in the tree (hidden) so its scroll position survives going back.
struct RowPageHost<List: View>: View {
    let pinID: String
    /// Fixed page height for hosts without a bounded frame (a database embedded in a page).
    var pageHeight: CGFloat? = nil
    @ViewBuilder let list: () -> List

    @State private var target: RowPageTarget?
    private let router = RowPageRouter.shared

    var body: some View {
        ZStack(alignment: .top) {
            list()
                .environment(\.openRowPage, { rowID, title in open(RowPageTarget(pinID: pinID, rowID: rowID, title: title)) })
                .opacity(target == nil ? 1 : 0)
                .offset(x: target == nil || Theme.Motion.reduceMotion ? 0 : -16)
                .allowsHitTesting(target == nil)
                .accessibilityHidden(target != nil)
            if let target {
                RowPageView(target: target, onBack: close)
                    .id(target.rowID)
                    .frame(height: pageHeight)
                    .transition(Theme.Motion.reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .animation(Theme.Motion.contents, value: target)
        .onAppear { takePending() }
        .onChange(of: router.pending) { _, _ in takePending() }
    }

    private func open(_ newTarget: RowPageTarget) { target = newTarget }
    private func close() { target = nil }

    private func takePending() {
        if let next = router.take(forPin: pinID) { target = next }
    }
}

/// Header (back, row title, Open in Notion) over the row's page editor.
private struct RowPageView: View {
    let target: RowPageTarget
    let onBack: () -> Void

    @State private var model: PageViewModel?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                RowPageIconButton(systemName: "chevron.left", help: "Back to list", action: onBack)
                Text(target.displayTitle)
                    .font(Theme.Font.body.weight(.semibold))
                    .foregroundStyle(Theme.Color.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                RowPageIconButton(systemName: "arrow.up.right.square", help: "Open in Notion") {
                    RowPageRouter.openInNotion(id: target.rowID)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            Rectangle().fill(Theme.Color.divider).frame(height: 1)
            if let model {
                PageView(model: model)
            } else {
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.Color.notch)
        .onAppear { if model == nil { model = RowPageRouter.shared.makeModel(for: target) } }
    }
}

struct RowPageIconButton: View {
    let systemName: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Color.secondaryText)
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .notionHover()
        .help(help)
    }
}
