import SwiftUI
import Observation

/// Everything the notch renders. `DockController` mutates it inside `withAnimation`, so
/// every phase change — opening *and* closing — runs through one SwiftUI transaction.
/// (Replacing `NSHostingView.rootView` instead does not reliably animate.)
@Observable
final class NotchState {
    var layout = NotchLayout()
    var isResizing = false
    var phase: NotchPhase = .resting
    var pins: [PinItem] = []
    var selectedPinID: String?
    var expandedContent: NotchExpandedContent?
    var groups: [PinGroupItem] = []
    var activeGroupID: String?
    /// Hover peek: the pin whose tooltip card is showing and that icon's frame (window coordinates).
    var peekPinID: String?
    var peekFrame: CGRect = .zero
    /// True while the cursor is over the peek card itself, which keeps it open.
    var peekCardHovered = false

    /// Hides the peek card shortly after the cursor leaves the icon, unless it moved onto
    /// the card (the gap between icon and card must not close it).
    func schedulePeekDismiss(for id: String?) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !self.peekCardHovered, self.peekPinID == id else { return }
            self.peekPinID = nil
        }
    }
}

struct NotchActions {
    let onSelectPin: (PinItem, CGRect) -> Void
    let onAddTap: (CGRect) -> Void
    let onUnpin: (PinItem) -> Void
    let onOpenInNotionPin: (PinItem) -> Void
    let onKeepOpen: (PinItem) -> Void
    let isKeptOpen: (PinItem) -> Bool
    let onChangeIcon: (PinItem) -> Void
    var onEditView: (PinItem) -> Void = { _ in }
    /// Tick an item shown in the hover peek: (pin id, item id).
    let onCheckPeekItem: (String, String) -> Void
    /// Open a peek item's title: (pin id, item id, item title).
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
}

/// Installed once as the panel's root; re-renders from `NotchState` changes.
struct NotchHostView: View {
    let state: NotchState
    let actions: NotchActions

    var body: some View {
        NotchRootView(
            layout: state.layout,
            isResizing: state.isResizing,
            phase: state.phase,
            pins: state.pins,
            selectedPinID: state.selectedPinID,
            expandedContent: state.expandedContent,
            groups: state.groups,
            activeGroupID: state.activeGroupID,
            peekPinID: state.peekPinID,
            peekFrame: state.peekFrame,
            onPeek: { pin, frame in
                guard let id = pin?.id else {
                    state.schedulePeekDismiss(for: state.peekPinID)
                    return
                }
                if state.peekPinID != id { state.peekPinID = id }
                state.peekFrame = frame
            },
            onPeekCardHover: { hovering in
                state.peekCardHovered = hovering
                if !hovering { state.schedulePeekDismiss(for: state.peekPinID) }
            },
            onSelectPin: actions.onSelectPin,
            onAddTap: actions.onAddTap,
            onUnpin: actions.onUnpin,
            onOpenInNotionPin: actions.onOpenInNotionPin,
            onKeepOpen: actions.onKeepOpen,
            isKeptOpen: actions.isKeptOpen,
            onChangeIcon: actions.onChangeIcon,
            onEditView: actions.onEditView,
            onCheckPeekItem: actions.onCheckPeekItem,
            onOpenPeekItem: actions.onOpenPeekItem,
            onTogglePin: actions.onTogglePin,
            onClosePanel: actions.onClosePanel,
            onOpenInNotion: actions.onOpenInNotion,
            onReorder: actions.onReorder,
            onSelectGroup: actions.onSelectGroup,
            onNewGroup: actions.onNewGroup,
            onManageGroups: actions.onManageGroups,
            onMoveToGroup: actions.onMoveToGroup,
            onResize: actions.onResize,
            onResetPanelSize: actions.onResetPanelSize
        )
    }
}
