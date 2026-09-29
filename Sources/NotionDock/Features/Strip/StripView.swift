import SwiftUI

/// The pinned-item icon column. Hosted directly inside the black notch shape (no background
/// of its own) — used both for the `.strip` phase and as the edge-side rail while `.expanded`.
struct StripView: View {
    let pins: [PinItem]
    let selectedPinID: String?
    let onSelect: (PinItem, CGRect) -> Void
    let onAdd: (CGRect) -> Void
    var onUnpin: ((PinItem) -> Void)? = nil
    var onOpenInNotion: ((PinItem) -> Void)? = nil
    var onKeepOpen: ((PinItem) -> Void)? = nil
    var isKeptOpen: ((PinItem) -> Bool)? = nil
    var onChangeIcon: ((PinItem) -> Void)? = nil
    var onEditView: ((PinItem) -> Void)? = nil
    /// Hover peek (only supplied by the primary strip): reports the hovered pin + icon frame
    /// after a 0.5s dwell, or `nil` when the hover ends.
    var onPeek: ((PinItem?, CGRect) -> Void)? = nil
    /// Whether icons should play their staggered fade/slide-in (true right after unfolding).
    var animateAppearance: Bool = true

    /// Reordering within the active group (drag threshold ~4pt distinguishes from a click).
    var onReorder: ((PinItem, Int) -> Void)? = nil

    /// Pin groups: shown as a compact switcher at the top of the strip, and as a
    /// "Move to group ›" context-menu submenu on every icon.
    var groups: [PinGroupItem] = []
    var activeGroupID: String? = nil
    var onSelectGroup: ((String?) -> Void)? = nil
    var onNewGroup: (() -> Void)? = nil
    var onManageGroups: (() -> Void)? = nil
    var onMoveToGroup: ((PinItem, String?) -> Void)? = nil
    /// Only the primary strip shows the switcher; the expanded-state rail is too narrow for it.
    var showGroupSwitcher: Bool = false
    /// `.vertical` on the side edges, `.horizontal` (icons in a row) on the top edge.
    var axis: Axis = .vertical

    private var layout: AnyLayout {
        axis == .vertical
            ? AnyLayout(VStackLayout(spacing: Theme.Notch.iconSpacing))
            : AnyLayout(HStackLayout(spacing: Theme.Notch.iconSpacing))
    }

    var body: some View {
        layout {
            if showGroupSwitcher, let onSelectGroup {
                GroupSwitcher(
                    groups: groups,
                    activeGroupID: activeGroupID,
                    onSelectGroup: onSelectGroup,
                    onNewGroup: onNewGroup,
                    onManageGroups: onManageGroups,
                    popoverEdge: axis == .vertical ? .leading : .bottom
                )
                .padding(axis == .vertical ? .bottom : .trailing, 2)
            }

            ReorderableStrip(
                pins: pins,
                selectedPinID: selectedPinID,
                animateAppearance: animateAppearance,
                axis: axis,
                onSelect: onSelect,
                onPeek: onPeek,
                onReorder: onReorder
            ) { pin in
                AnyView(contextMenu(for: pin))
            }

            AddIcon(index: pins.count, animateAppearance: animateAppearance, onTap: onAdd)
        }
        .padding(axis == .vertical ? .vertical : .horizontal, Theme.Notch.stripPadding)
        .padding(axis == .vertical ? .horizontal : .vertical, 6)
    }

    @ViewBuilder
    private func contextMenu(for pin: PinItem) -> some View {
        if let onKeepOpen, let isKeptOpen {
            Button(isKeptOpen(pin) ? "Keep open ✓" : "Keep open") {
                onKeepOpen(pin)
            }
        }
        if let onChangeIcon {
            Button("Change Icon…") { onChangeIcon(pin) }
        }
        if pin.isDatabase, let onEditView {
            Button("Edit View…") { onEditView(pin) }
        }
        if let onMoveToGroup, !groups.isEmpty {
            Menu("Move to group") {
                Button("Ungrouped") { onMoveToGroup(pin, nil) }
                Divider()
                ForEach(groups) { group in
                    Button(group.displayLabel) { onMoveToGroup(pin, group.id) }
                }
            }
        }
        if let onOpenInNotion {
            Button("Open in Notion") { onOpenInNotion(pin) }
        }
        if let onUnpin {
            Button("Unpin") { onUnpin(pin) }
        }
    }
}

private extension PinGroupItem {
    var displayLabel: String {
        if let emoji, !emoji.isEmpty { return "\(emoji) \(name)" }
        return name
    }
}

/// Vertical icon list with drag-to-reorder: a drag past a ~4pt threshold picks up the icon,
/// shifts the others out of the way with `Theme.Motion.list`, and drops it at the new index.
/// Uses a plain `DragGesture` (not `.onDrag`/`.onDrop`), which needs no drag session or app
/// activation and so works while the hosting `NSPanel` is non-activating.
private struct ReorderableStrip: View {
    let pins: [PinItem]
    let selectedPinID: String?
    let animateAppearance: Bool
    let axis: Axis
    let onSelect: (PinItem, CGRect) -> Void
    let onPeek: ((PinItem?, CGRect) -> Void)?
    let onReorder: ((PinItem, Int) -> Void)?
    let contextMenu: (PinItem) -> AnyView

    @State private var draggingPinID: String?
    @State private var dragTranslation: CGFloat = 0

    private var rowStride: CGFloat { Theme.Notch.iconSize + Theme.Notch.iconSpacing }

    private var draggedOriginalIndex: Int? {
        guard let draggingPinID else { return nil }
        return pins.firstIndex { $0.id == draggingPinID }
    }

    private var draggedTargetIndex: Int? {
        guard let originalIndex = draggedOriginalIndex else { return nil }
        let shift = Int((dragTranslation / rowStride).rounded())
        return max(0, min(pins.count - 1, originalIndex + shift))
    }

    private var rowLayout: AnyLayout {
        axis == .vertical
            ? AnyLayout(VStackLayout(spacing: Theme.Notch.iconSpacing))
            : AnyLayout(HStackLayout(spacing: Theme.Notch.iconSpacing))
    }

    var body: some View {
        rowLayout {
            ForEach(Array(pins.enumerated()), id: \.element.id) { index, pin in
                StripIcon(pin: pin, index: index, isSelected: pin.id == selectedPinID, animateAppearance: animateAppearance, onPeek: onPeek) { frame in
                    onPeek?(nil, .zero)
                    onSelect(pin, frame)
                }
                .contextMenu { contextMenu(pin) }
                .offset(x: axis == .horizontal ? offset(forRowAt: index, pin: pin) : 0, y: axis == .vertical ? offset(forRowAt: index, pin: pin) : 0)
                .zIndex(draggingPinID == pin.id ? 1 : 0)
                .gesture(reorderGesture(for: pin, at: index), including: onReorder == nil ? .subviews : .all)
                .animation(Theme.Motion.list, value: draggedTargetIndex)
            }
        }
    }

    private func offset(forRowAt index: Int, pin: PinItem) -> CGFloat {
        if pin.id == draggingPinID {
            return dragTranslation
        }
        guard onReorder != nil, let originalIndex = draggedOriginalIndex, let targetIndex = draggedTargetIndex, originalIndex != targetIndex else {
            return 0
        }
        if targetIndex > originalIndex, index > originalIndex, index <= targetIndex {
            return -rowStride
        }
        if targetIndex < originalIndex, index >= targetIndex, index < originalIndex {
            return rowStride
        }
        return 0
    }

    /// `minimumDistance: 4` per the brief, so a plain click still reaches the icon's `Button`
    /// (SwiftUI cancels the button's own tap once a gesture with a larger minimum distance wins).
    private func reorderGesture(for pin: PinItem, at index: Int) -> some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .local)
            .onChanged { value in
                guard onReorder != nil else { return }
                draggingPinID = pin.id
                dragTranslation = axis == .vertical ? value.translation.height : value.translation.width
            }
            .onEnded { _ in
                defer {
                    draggingPinID = nil
                    dragTranslation = 0
                }
                guard let onReorder, let targetIndex = draggedTargetIndex, targetIndex != index else { return }
                onReorder(pin, targetIndex)
            }
    }
}

private struct StripIcon: View {
    let pin: PinItem
    let index: Int
    let isSelected: Bool
    let animateAppearance: Bool
    var onPeek: ((PinItem?, CGRect) -> Void)? = nil
    let onTap: (CGRect) -> Void

    @State private var appeared = false
    @State private var peekTask: Task<Void, Never>?

    var body: some View {
        GeometryReader { proxy in
            Button {
                let frame = proxy.frame(in: .global)
                onTap(frame)
            } label: {
                PinIconView(icon: pin.icon)
                    .frame(width: Theme.Notch.iconSize, height: Theme.Notch.iconSize)
            }
            .buttonStyle(.notion)
            .focusEffectDisabled()
            .notionHover(selected: isSelected)
            .help(onPeek == nil ? pin.title : "")
            .onHover { hovering in
                peekTask?.cancel()
                guard let onPeek else { return }
                if hovering {
                    let frame = proxy.frame(in: .global)
                    peekTask = Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 500_000_000)
                        if !Task.isCancelled { onPeek(pin, frame) }
                    }
                } else {
                    onPeek(nil, .zero)
                }
            }
            .onDisappear { peekTask?.cancel() }
        }
        .frame(width: Theme.Notch.iconSize, height: Theme.Notch.iconSize)
        .overlay(alignment: .topTrailing) { PinBadge(pinID: pin.id) }
        .opacity(appeared || !animateAppearance ? 1 : 0)
        .offset(y: appeared || !animateAppearance ? 0 : 6)
        .onAppear {
            guard animateAppearance else { appeared = true; return }
            withAnimation(Theme.Motion.contents.delay(Theme.Motion.stagger(index))) {
                appeared = true
            }
        }
    }
}

/// Small accent count bubble at an icon's top-trailing corner. Hidden when off or at 0.
private struct PinBadge: View {
    let pinID: String

    var body: some View {
        let count = badgeCount
        if count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 9 * Settings.shared.size.fontScale, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(minWidth: 14, minHeight: 14)
                .background(Capsule().fill(Theme.Color.accent))
                .overlay(Capsule().stroke(Theme.Color.notch, lineWidth: 1.5))
                .offset(x: 6, y: -5)
                .allowsHitTesting(false)
                .transition(.scale.combined(with: .opacity))
        }
    }

    private var badgeCount: Int {
        guard let summary = PinSummaryService.shared.summary(for: pinID) else { return 0 }
        switch Settings.shared.badgeMode {
        case .off: return 0
        case .open: return summary.openCount
        case .dueToday: return summary.dueTodayCount
        }
    }
}

private struct AddIcon: View {
    let index: Int
    let animateAppearance: Bool
    let onTap: (CGRect) -> Void

    @State private var appeared = false

    var body: some View {
        GeometryReader { proxy in
            Button {
                onTap(proxy.frame(in: .global))
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.secondaryText)
                    .frame(width: Theme.Notch.iconSize, height: Theme.Notch.iconSize)
            }
            .buttonStyle(.notion)
            .focusEffectDisabled()
            .notionHover()
        }
        .frame(width: Theme.Notch.iconSize, height: Theme.Notch.iconSize)
        .opacity(appeared || !animateAppearance ? 1 : 0)
        .offset(y: appeared || !animateAppearance ? 0 : 6)
        .onAppear {
            guard animateAppearance else { appeared = true; return }
            withAnimation(Theme.Motion.contents.delay(Theme.Motion.stagger(index))) {
                appeared = true
            }
        }
    }
}

/// Compact group switcher shown above the strip's icons: the active group's emoji/initial,
/// tapped to open a popover listing every group plus "All pins" / "New group…" / "Manage…".
private struct GroupSwitcher: View {
    let groups: [PinGroupItem]
    let activeGroupID: String?
    let onSelectGroup: (String?) -> Void
    var onNewGroup: (() -> Void)?
    var onManageGroups: (() -> Void)?
    var popoverEdge: Edge = .leading

    @State private var showPopover = false

    private var activeGroup: PinGroupItem? {
        groups.first { $0.id == activeGroupID }
    }

    var body: some View {
        Button {
            showPopover = true
        } label: {
            Group {
                if let activeGroup {
                    Text(activeGroup.emoji?.isEmpty == false ? activeGroup.emoji! : String(activeGroup.name.prefix(1)).uppercased())
                        .font(.system(size: 12, weight: .semibold))
                } else {
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 11, weight: .medium))
                }
            }
            .foregroundStyle(Theme.Color.secondaryText)
            .frame(width: Theme.Notch.iconSize - 6, height: Theme.Notch.iconSize - 6)
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .notionHover()
        .help(activeGroup?.name ?? "All pins")
        .popover(isPresented: $showPopover, arrowEdge: popoverEdge) {
            GroupSwitcherPopover(
                groups: groups,
                activeGroupID: activeGroupID,
                onSelectGroup: { groupID in
                    onSelectGroup(groupID)
                    showPopover = false
                },
                onNewGroup: {
                    showPopover = false
                    onNewGroup?()
                },
                onManageGroups: {
                    showPopover = false
                    onManageGroups?()
                }
            )
        }
    }
}

private struct GroupSwitcherPopover: View {
    let groups: [PinGroupItem]
    let activeGroupID: String?
    let onSelectGroup: (String?) -> Void
    let onNewGroup: () -> Void
    let onManageGroups: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            row(title: "All pins", isActive: activeGroupID == nil) { onSelectGroup(nil) }
            ForEach(groups) { group in
                row(title: group.displayLabel, isActive: activeGroupID == group.id) { onSelectGroup(group.id) }
            }
            Divider().padding(.vertical, 4)
            row(title: "New group…", isActive: false, action: onNewGroup)
            row(title: "Manage…", isActive: false, action: onManageGroups)
        }
        .padding(6)
        .frame(minWidth: 160)
        .background(Theme.Color.background)
    }

    private func row(title: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.text)
                Spacer()
                if isActive {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.Color.secondaryText)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.notion)
        .focusEffectDisabled()
        .notionHover()
    }
}
