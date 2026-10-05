import SwiftUI
import NotionKit

/// What the expanded state currently hosts: an existing pin's panel, or the add/pinning flow.
enum NotchExpandedContent {
    case pin(title: String, icon: PinIconDisplay, content: AnyView, isPinned: Bool, canOpenInNotion: Bool)
    case addFlow(AnyView)
}

/// The single SwiftUI root drawn inside `NotchPanel`. Renders the morphing `EdgeNotchShape`
/// and, clipped to it, whatever the current phase needs: nothing (resting), the pin icon
/// column (strip), or the icon column plus a panel (expanded).
struct NotchRootView: View {
    let layout: NotchLayout
    let isResizing: Bool
    let phase: NotchPhase
    let pins: [PinItem]
    let selectedPinID: String?
    let expandedContent: NotchExpandedContent?
    let groups: [PinGroupItem]
    let activeGroupID: String?
    let peekPinID: String?
    let peekFrame: CGRect
    let onPeek: (PinItem?, CGRect) -> Void
    let onPeekCardHover: (Bool) -> Void

    let onSelectPin: (PinItem, CGRect) -> Void
    let onAddTap: (CGRect) -> Void
    let onUnpin: (PinItem) -> Void
    let onOpenInNotionPin: (PinItem) -> Void
    let onKeepOpen: (PinItem) -> Void
    let isKeptOpen: (PinItem) -> Bool
    let onChangeIcon: (PinItem) -> Void
    var onEditView: (PinItem) -> Void = { _ in }
    let onCheckPeekItem: (String, String) -> Void
    var onOpenPeekItem: (String, String, String) -> Void = { _, _, _ in }
    let onTogglePin: () -> Void
    let onClosePanel: () -> Void
    let onOpenInNotion: () -> Void
    let onReorder: (PinItem, Int) -> Void
    let onSelectGroup: (String?) -> Void
    let onNewGroup: () -> Void
    let onManageGroups: () -> Void
    let onMoveToGroup: (PinItem, String?) -> Void
    let onResize: (ResizeHandle, ResizeEvent) -> Void
    let onResetPanelSize: () -> Void

    private var edge: DockEdge { layout.edge }
    private var windowSize: CGSize { layout.windowSize }
    private var pillStyle: PillStyle { layout.pillStyle }
    private var metrics: Theme.Notch.Metrics { layout.metrics(for: phase) }
    private var center: CGFloat { layout.center(for: phase) }
    private var expandedAnimation: Animation? { isResizing ? nil : Theme.Motion.unfold }

    private func shape(_ m: Theme.Notch.Metrics) -> EdgeNotchShape {
        EdgeNotchShape(depth: m.depth, length: m.length, cornerRadius: m.corner, flare: m.flare, center: center, edge: edge)
    }

    private var shapeVisible: Bool { !(phase == .resting && pillStyle == .hidden) }

    var body: some View {
        ZStack {
            shape(metrics)
                .fill(Theme.Color.notch)
                .opacity(shapeVisible ? 1 : 0)

            pillProgress

            // Each phase lays its content out at its own final size; the morphing clip shape
            // reveals it while unfolding and swallows it while folding.
            let rect = layout.bodyRect(for: phase)
            body(for: phase)
                .frame(width: max(rect.width, 0), height: max(rect.height, 0))
                .position(x: rect.midX, y: rect.midY)
                .id(phase)
                .transition(Theme.Motion.phaseTransition(edge: edge))

            if phase == .expanded, case .pin = expandedContent {
                ResizeGrips(edge: edge, rect: layout.bodyRect(for: .expanded), onResize: onResize, onReset: onResetPanelSize)
            }
        }
        .frame(width: windowSize.width, height: windowSize.height, alignment: .topLeading)
        .clipShape(shape(metrics))
        // Outside the clip: a soft shadow lifts the notch off light wallpapers, and a hairline
        // rim keeps it visible on black ones (a black shadow can't show on black).
        .background {
            shape(metrics)
                .fill(Theme.Color.notch)
                .shadow(color: .black.opacity(0.45), radius: phase == .resting ? 4 : 14, y: 2)
                .opacity(shapeVisible ? 1 : 0)
        }
        .overlay {
            if Settings.shared.notchOutline {
                shape(metrics)
                    .stroke(Color.white.opacity(phase == .resting ? 0.22 : 0.14), lineWidth: 1)
                    .opacity(shapeVisible ? 1 : 0)
                    .allowsHitTesting(false)
            }
        }
        .animation(expandedAnimation, value: phase)
        .animation(expandedAnimation, value: metrics)
        .animation(expandedAnimation, value: center)
        .animation(Theme.Motion.contents, value: pillStyle)
        .overlay { peekOverlay }
    }

    // MARK: - Live pill

    /// Pins the pill's progress and label measure: the last opened pin, or (default) the
    /// strip's active group.
    private var pillSummaries: [PinSummary] {
        let service = PinSummaryService.shared
        if Settings.shared.pillProgressMode == .lastPin {
            return Settings.shared.lastOpenedPinID.flatMap { service.summary(for: $0) }.map { [$0] } ?? []
        }
        return pins.compactMap { service.summary(for: $0.id) }
    }

    private var pillCounts: (done: Int, total: Int)? { PinSummary.progressCounts(pillSummaries) }

    private var pillRatio: Double? {
        guard Settings.shared.pillProgressMode != .off, let c = pillCounts else { return nil }
        return Double(c.done) / Double(c.total)
    }

    private var pillLabel: String {
        guard let c = pillCounts else { return "–" }
        return PillLabel.text(done: c.done, total: c.total, asFraction: Settings.shared.pillShowsFraction)
    }

    /// Accent fill along the resting pill's length (Line: a thin bar; Percent: a wash behind
    /// the label), growing from the bottom / leading end. Drawn inside the clipped ZStack so
    /// it keeps the pill's shape.
    @ViewBuilder
    private var pillProgress: some View {
        if let ratio = pillRatio, pillStyle == .line || pillStyle == .percent {
            let r = layout.bodyRect(for: .resting)
            let fraction = CGFloat(min(max(ratio, 0), 1))
            let wash = pillStyle == .percent
            let thick = wash ? (edge == .top ? r.height : r.width) : max(2, 3 * Settings.shared.size.metricsScale)
            let along = (edge == .top ? r.width : r.height) * fraction
            Rectangle()
                .fill(Theme.Color.accent.opacity(wash ? 0.4 : 0.7))
                .frame(width: edge == .top ? along : thick, height: edge == .top ? thick : along)
                .position(
                    x: edge == .top ? r.minX + along / 2 : r.midX,
                    y: edge == .top ? r.midY : r.maxY - along / 2
                )
                .opacity(phase == .resting ? 1 : 0)
                .animation(Theme.Motion.contents, value: ratio)
        }
    }

    // MARK: - Hover peek

    @ViewBuilder
    private var peekOverlay: some View {
        ZStack {
            if phase == .strip, let peekPinID, let pin = pins.first(where: { $0.id == peekPinID }) {
                let summary = PinSummaryService.shared.summary(for: peekPinID)
                let rect = layout.peekRect(peekFrame: peekFrame, itemCount: summary?.nextItems.count ?? 0)
                PeekTooltip(title: pin.title, summary: summary, onCheck: { itemID in onCheckPeekItem(pin.id, itemID) },
                             onOpenItem: { itemID, title in onOpenPeekItem(pin.id, itemID, title) })
                    .frame(width: rect.width)
                    .contentShape(Rectangle())
                    .onHover(perform: onPeekCardHover)
                    .onTapGesture { onSelectPin(pin, peekFrame) }
                    .position(x: rect.midX, y: rect.midY)
                    .transition(reduceScale(edge))
            }
        }
        .frame(width: windowSize.width, height: windowSize.height)
        .animation(Theme.Motion.contents, value: peekPinID)
    }

    private func reduceScale(_ edge: DockEdge) -> AnyTransition {
        let anchor: UnitPoint = edge == .right ? .trailing : (edge == .left ? .leading : .top)
        return Theme.Motion.reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.92, anchor: anchor))
    }

    @ViewBuilder
    private func body(for phase: NotchPhase) -> some View {
        switch phase {
        case .resting:
            if pillStyle == .percent {
                Text(pillLabel)
                    .font(.system(size: 10 * Settings.shared.size.fontScale, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Color.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else {
                Color.clear
            }
        case .strip:
            StripView(
                pins: pins,
                selectedPinID: selectedPinID,
                onSelect: onSelectPin,
                onAdd: onAddTap,
                onUnpin: onUnpin,
                onOpenInNotion: onOpenInNotionPin,
                onKeepOpen: onKeepOpen,
                isKeptOpen: isKeptOpen,
                onChangeIcon: onChangeIcon,
                onEditView: onEditView,
                onPeek: onPeek,
                onReorder: onReorder,
                groups: groups,
                activeGroupID: activeGroupID,
                onSelectGroup: onSelectGroup,
                onNewGroup: onNewGroup,
                onManageGroups: onManageGroups,
                onMoveToGroup: onMoveToGroup,
                showGroupSwitcher: true,
                axis: edge == .top ? .horizontal : .vertical
            )
            .padding(.top, layout.topInset)
        case .expanded:
            expandedBody
                .id(isAddFlow)
                .transition(.opacity.animation(Theme.Motion.crossfade))
        }
    }

    private var isAddFlow: Bool {
        if case .addFlow = expandedContent { return true }
        return false
    }

    @ViewBuilder
    private var expandedBody: some View {
        switch expandedContent {
        case .pin(let title, let icon, let content, let isPinned, let canOpenInNotion):
            let rail = StripView(
                pins: pins,
                selectedPinID: selectedPinID,
                onSelect: onSelectPin,
                onAdd: onAddTap,
                onUnpin: onUnpin,
                onOpenInNotion: onOpenInNotionPin,
                onKeepOpen: onKeepOpen,
                isKeptOpen: isKeptOpen,
                onChangeIcon: onChangeIcon,
                onEditView: onEditView,
                animateAppearance: false,
                onReorder: onReorder,
                groups: groups,
                activeGroupID: activeGroupID,
                onMoveToGroup: onMoveToGroup,
                axis: edge == .top ? .horizontal : .vertical
            )

            let panel = PanelView(
                pin: PinItem(id: selectedPinID ?? title, title: title, icon: icon),
                content: content,
                isPinned: isPinned,
                onTogglePin: onTogglePin,
                onClose: onClosePanel,
                onOpenInNotion: canOpenInNotion ? onOpenInNotion : nil,
                onChangeIcon: pins.first(where: { $0.id == selectedPinID && !TodayPin.isToday($0.id) }).map { item in { onChangeIcon(item) } }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            let divider = Rectangle().fill(Theme.Color.divider)
            switch edge {
            case .top:
                VStack(spacing: 0) {
                    rail.frame(height: Theme.Notch.stripDepth)
                    divider.frame(height: 1)
                    panel
                }
                .padding(.top, layout.topInset)
            case .left:
                HStack(spacing: 0) { rail.frame(width: Theme.Notch.stripDepth); divider.frame(width: 1); panel }
            case .right:
                HStack(spacing: 0) { panel; divider.frame(width: 1); rail.frame(width: Theme.Notch.stripDepth) }
            }
        case .addFlow(let content):
            content
        case .none:
            Color.clear
        }
    }
}
