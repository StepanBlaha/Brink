import AppKit
import os
import SwiftUI
import NotionKit

@MainActor
final class DockController {
    private let appModel: AppModel
    private var pageModels: [String: PageViewModel] = [:]
    private var databaseModels: [String: DatabaseViewModel] = [:]
    private var pollingPinID: String?

    private let panel: NotchPanel
    private var settingsWindowController: SettingsWindowController?

    private var phase: NotchPhase = .resting
    private var selectedPinID: String?
    private var isPanelPinned = false
    private var addFlowContent: AnyView?

    private var windowSize: CGSize = .zero
    /// Side edges: where the expanded panel is centered along the edge (follows the clicked icon).
    private var expandedCenter: CGFloat = 0
    /// Window-local placement along the edge, and hardware-notch merge info (top edge).
    private var layoutAnchor: CGFloat = 0
    private var anchorLeading = false
    private var topInset: CGFloat = 0
    private var mergedWidth: CGFloat?
    private var currentScreen: NSScreen?
    private var positionedPinCount = -1

    private let panelSizes = PanelSizeStore()
    private struct ResizeSession { let handle: ResizeHandle; let startMouse: CGPoint; let startSize: CGSize }
    private var resizeSession: ResizeSession?
    private var liveExpandedSize: CGSize?

    private var globalClickMonitor: Any?
    private var localClickMonitor: Any?
    private var localKeyMonitor: Any?
    private var globalMouseMovedMonitor: Any?
    private var localMouseMovedMonitor: Any?

    private var collapseWorkItem: DispatchWorkItem?
    private var hotkeys: HotkeyCenter?

    /// The active group's pins (or every pin, if the switcher is on "All pins"), mapped to
    /// the strip's display model. `PinStore.pins` is kept sorted by `order` already.
    private var realPins: [PinItem] {
        activePins.map(mapPinItem)
    }

    /// What the strip shows: the virtual Today pin (if enabled) followed by the real pins.
    private var pins: [PinItem] {
        Settings.shared.showTodayPin ? [TodayPin.item] + realPins : realPins
    }

    private var stripPinCount: Int { activePins.count + (Settings.shared.showTodayPin ? 1 : 0) }

    private var activePins: [Pin] {
        guard let groupID = Settings.shared.activeGroupID,
              appModel.pinStore.groups.contains(where: { $0.id == groupID }) else {
            return appModel.pinStore.pins
        }
        return appModel.pinStore.pins.filter { $0.groupId == groupID }
    }

    private var groupItems: [PinGroupItem] {
        appModel.pinStore.groups.map { PinGroupItem(id: $0.id, name: $0.name, emoji: $0.emoji) }
    }

    init(appModel: AppModel) {
        self.appModel = appModel
        panel = NotchPanel(size: NSSize(width: 400, height: 400))
        positionPanel()
        expandedCenter = windowSize.height / 2
        panel.orderFrontRegardless()
        refreshContent()
        installMouseMovedMonitors()

        PinSummaryService.shared.start(appModel: appModel)
        startReminders()
        hotkeys = HotkeyCenter { [weak self] action, index in
            self?.handleHotkey(action, pinIndex: index)
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(menuDidBeginTracking), name: NSMenu.didBeginTrackingNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(menuDidEndTracking), name: NSMenu.didEndTrackingNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersChanged),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersChanged),
            name: Settings.layoutDidChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(openPinRequested(_:)), name: .openPinInNotchRequested, object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(sizeSettingChanged),
            name: Settings.sizeDidChangeNotification,
            object: nil
        )
    }

    @objc private func openPinRequested(_ note: Notification) {
        guard let pinID = note.object as? String else { return }
        if TodayPin.isToday(pinID) {
            guard Settings.shared.showTodayPin else { return }
        } else {
            guard appModel.pinStore.pins.contains(where: { $0.id == pinID }) else { return }
            // A pin outside the active group would not be in the strip: show every pin.
            if !activePins.contains(where: { $0.id == pinID }) { Settings.shared.activeGroupID = nil }
        }
        addFlowContent = nil
        guard let index = pins.firstIndex(where: { $0.id == pinID }) else { return }
        let item = pins[index]
        if phase == .expanded, selectedPinID == pinID { return }
        // Where the pin's icon sits in the (vertically centered) side strip.
        let m = Theme.Notch.self
        let stripTop = windowSize.height / 2 - m.stripMetrics(pinCount: pins.count).length / 2
        let switcher = m.iconSize + m.iconSpacing + 6 * Settings.shared.size.metricsScale
        let mid = stripTop + m.stripPadding + switcher + CGFloat(index) * (m.iconSize + m.iconSpacing) + m.iconSize / 2
        let frame = CGRect(x: 0, y: mid - m.iconSize / 2, width: m.iconSize, height: m.iconSize)
        refreshContent()
        open(pinItem: item, iconFrameGlobal: frame)
    }

    @objc private func sizeSettingChanged() {
        positionPanel()
        if phase == .expanded {
            setPhase(.resting)
        } else {
            refreshContent()
        }
    }

    // MARK: - Pin mapping

    private func mapPinItem(_ pin: Pin) -> PinItem {
        PinItem(id: pin.id, title: pin.title, icon: iconDisplay(for: pin), isDatabase: pin.kind == .dataSource)
    }

    /// A pin's `customIcon` override wins; otherwise fall back to the Notion-derived icon
    /// (emoji, or the title's first letter if Notion has no icon), same as before this feature.
    private func iconDisplay(for pin: Pin) -> PinIconDisplay {
        if let custom = pin.customIcon {
            switch custom {
            case .emoji(let value):
                return .emoji(value)
            case .sfSymbol(let name, let colorHex):
                return .sfSymbol(name: name, colorHex: colorHex)
            case .letter(let text, let colorHex):
                return .letter(text: text, colorHex: colorHex)
            }
        }
        switch pin.icon {
        case .emoji(let value):
            return .emoji(value)
        case .url, .none:
            let trimmed = pin.title.trimmingCharacters(in: .whitespacesAndNewlines)
            return .emoji(trimmed.first.map { String($0).uppercased() } ?? "•")
        }
    }

    private func pin(withPinItemID id: String) -> Pin? {
        appModel.pinStore.pins.first { $0.id == id }
    }

    // MARK: - Content

    private var expandedContentValue: NotchExpandedContent? {
        if let addFlowContent {
            return .addFlow(addFlowContent)
        }
        guard let selectedPinID, let pinItem = pins.first(where: { $0.id == selectedPinID }) else { return nil }
        if TodayPin.isToday(selectedPinID) {
            return .pin(title: pinItem.title, icon: pinItem.icon, content: todayContent(), isPinned: isPanelPinned, canOpenInNotion: false)
        }
        let backingPin = pin(withPinItemID: selectedPinID)
        let content = backingPin.map(panelContent(for:)) ?? AnyView(
            Text("Database not configured. Unpin and pin it again.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .padding()
        )
        return .pin(title: pinItem.title, icon: pinItem.icon, content: content, isPinned: isPanelPinned, canOpenInNotion: backingPin != nil)
    }

    private let notchState = NotchState()
    private let todayModel = TodayModel()
    private var isHostInstalled = false

    private func refreshContent() {
        installHostIfNeeded()
        // The top edge's strip can outgrow the window when pins are added.
        if Settings.shared.edge == .top, stripPinCount != positionedPinCount { positionPanel() }
        let state = notchState
        let content = expandedContentValue
        withAnimation(Theme.Motion.unfold) {
            state.layout = makeLayout()
            state.phase = phase
            state.pins = pins
            state.selectedPinID = selectedPinID
            state.expandedContent = content
            state.groups = groupItems
            state.activeGroupID = Settings.shared.activeGroupID
            if phase != .strip, state.peekPinID != nil { state.peekPinID = nil }
        }
        updatePassThrough()
    }

    private func installHostIfNeeded() {
        guard !isHostInstalled else { return }
        isHostInstalled = true
        let actions = NotchActions(
            onSelectPin: { [weak self] pinItem, frame in
                self?.selectPin(pinItem, iconFrame: frame)
            },
            onAddTap: { [weak self] frame in
                self?.presentAddFlow(near: frame)
            },
            onUnpin: { [weak self] pinItem in
                self?.unpin(pinItemID: pinItem.id)
            },
            onOpenInNotionPin: { [weak self] pinItem in
                guard let self, let backingPin = self.pin(withPinItemID: pinItem.id) else { return }
                self.openPinInNotion(backingPin)
            },
            onKeepOpen: { [weak self] pinItem in
                self?.toggleKeepOpen(for: pinItem)
            },
            isKeptOpen: { [weak self] pinItem in
                guard let self else { return false }
                return self.phase == .expanded && self.selectedPinID == pinItem.id && self.isPanelPinned
            },
            onChangeIcon: { [weak self] pinItem in
                self?.presentIconPicker(for: pinItem)
            },
            onEditView: { [weak self] pinItem in
                self?.presentEditView(for: pinItem)
            },
            onCheckPeekItem: { [weak self] pinID, itemID in
                self?.checkSummaryItem(pinID: pinID, itemID: itemID)
            },
            onOpenPeekItem: { [weak self] pinID, itemID, title in
                guard let self else { return }
                if self.pin(withPinItemID: pinID)?.kind == .dataSource {
                    RowPageRouter.shared.open(RowPageTarget(pinID: pinID, rowID: itemID, title: title))
                } else {
                    NotificationCenter.default.post(name: .openPinInNotchRequested, object: pinID)
                }
            },
            onTogglePin: { [weak self] in
                self?.isPanelPinned.toggle()
                self?.refreshContent()
            },
            onClosePanel: { [weak self] in
                self?.collapse(force: true)
            },
            onOpenInNotion: { [weak self] in
                guard let self, let id = self.selectedPinID, let backingPin = self.pin(withPinItemID: id) else { return }
                self.openPinInNotion(backingPin)
            },
            onReorder: { [weak self] pinItem, targetIndex in
                guard let self, !TodayPin.isToday(pinItem.id) else { return }
                // Today is not a stored pin: it only shifts the strip indices by one.
                let targetIndex = max(0, targetIndex - (Settings.shared.showTodayPin ? 1 : 0))
                if let groupID = Settings.shared.activeGroupID {
                    self.appModel.pinStore.move(pinID: pinItem.id, toIndex: targetIndex, withinGroup: groupID)
                } else {
                    self.appModel.pinStore.moveAmongAllPins(pinID: pinItem.id, toIndex: targetIndex)
                }
                self.refreshAfterPinsChanged()
            },
            onSelectGroup: { [weak self] groupID in
                Settings.shared.activeGroupID = groupID
                self?.refreshAfterPinsChanged()
            },
            onNewGroup: { [weak self] in
                self?.presentNewGroupPrompt()
            },
            onManageGroups: { [weak self] in
                self?.showSettings(section: .groups)
            },
            onMoveToGroup: { [weak self] pinItem, groupID in
                self?.appModel.pinStore.setGroup(pinID: pinItem.id, groupID: groupID)
                self?.refreshAfterPinsChanged()
            },
            onResize: { [weak self] handle, event in
                self?.handleResize(handle, event)
            },
            onResetPanelSize: { [weak self] in
                self?.resetPanelSize()
            }
        )
        panel.setContent(NotchHostView(state: notchState, actions: actions))
    }

    private func refreshAfterPinsChanged() {
        refreshContent()
        PinSummaryService.shared.pinsDidChange()
    }

    // MARK: - Global hotkeys

    private func handleHotkey(_ action: HotkeyAction, pinIndex: Int?) {
        switch action {
        case .quickCapture:
            NotificationCenter.default.post(name: .quickCaptureRequested, object: nil)
        case .clipboardAppend:
            NotificationCenter.default.post(name: .clipboardAppendRequested, object: nil)
        case .toggleLastPin:
            let candidates = realPins
            let target = candidates.first { $0.id == Settings.shared.lastOpenedPinID } ?? candidates.first
            if let target { toggleFromHotkey(target) }
        case .openPinN:
            guard let pinIndex, realPins.indices.contains(pinIndex) else { return }
            toggleFromHotkey(realPins[pinIndex])
        }
    }

    private func toggleFromHotkey(_ pinItem: PinItem) {
        addFlowContent = nil
        if phase == .expanded && selectedPinID == pinItem.id {
            collapse(force: true)
            return
        }
        expandedCenter = windowSize.height / 2
        open(pinItem: pinItem, iconFrameGlobal: nil)
    }

    // MARK: - Positioning

    /// The display the notch should live on, per the "Display" setting.
    private func resolveScreen() -> NSScreen? {
        let screens = NSScreen.screens
        let infos = screens.map { ScreenInfo(name: $0.localizedName, frame: $0.frame) }
        guard let index = Settings.shared.displayPreference.resolve(screens: infos, mouse: DemoMode.mouseLocation) else { return nil }
        return screens[index]
    }

    /// The camera housing's x-range and height on notched Macs.
    private func hardwareNotch(of screen: NSScreen) -> (minX: CGFloat, maxX: CGFloat, height: CGFloat)? {
        guard screen.safeAreaInsets.top > 0,
              let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea else { return nil }
        return (screen.frame.minX + left.width, screen.frame.maxX - right.width, screen.safeAreaInsets.top)
    }

    /// Sizes and places the window. It is always big enough for the largest expanded panel
    /// (900 wide / as tall as the screen) so live resizing never moves the window; the
    /// transparent remainder is click-through (`updatePassThrough`).
    private func positionPanel() {
        guard let screen = resolveScreen() else { return }
        currentScreen = screen
        let edge = Settings.shared.edge
        let frame = screen.frame
        let visible = screen.visibleFrame
        positionedPinCount = stripPinCount

        topInset = 0
        mergedWidth = nil
        anchorLeading = false
        var anchorX = frame.midX
        if edge == .top, let hw = hardwareNotch(of: screen) {
            if Settings.shared.mergeWithHardwareNotch {
                anchorX = (hw.minX + hw.maxX) / 2
                topInset = hw.height
                // 1 pt wider than the auxiliary areas' gap: the housing's mask sits half a point
                // off those (whole-point) areas, and a sliver of it showed past the outline.
                mergedWidth = hw.maxX - hw.minX + 1
            } else {
                anchorX = hw.maxX + 12
                anchorLeading = true
            }
        }

        let size: CGSize
        switch edge {
        case .left, .right:
            size = CGSize(width: min(PanelSizeLimits.maxWidth, visible.width), height: visible.height)
        case .top:
            let strip = Theme.Notch.stripMetrics(pinCount: stripPinCount).length + 2 * Theme.Notch.stripFlare
            // From the screen's top down to the Dock (visible bottom): the panel never covers it.
            size = CGSize(width: min(frame.width, max(PanelSizeLimits.maxWidth + 120, strip + 80)), height: frame.maxY - visible.minY)
        }
        let windowFrame = NotchGeometry.windowFrame(edge: edge.kind, frame: frame, visible: visible, size: size, topAnchorX: anchorX, topLeading: anchorLeading)
        windowSize = size
        layoutAnchor = edge == .top ? anchorX - windowFrame.minX : size.height / 2
        if panel.frame != windowFrame { panel.setFrame(windowFrame, display: true) }
    }

    private func makeLayout() -> NotchLayout {
        var layout = NotchLayout(
            edge: Settings.shared.edge,
            windowSize: windowSize,
            pinCount: stripPinCount,
            anchor: layoutAnchor,
            anchorLeading: anchorLeading,
            expandedCenter: expandedCenter,
            topInset: topInset,
            mergedWidth: mergedWidth,
            pillStyle: Settings.shared.pillStyle
        )
        let maxSize = layout.maxPanelSize
        if let liveExpandedSize {
            layout.expandedSize = PanelSizeLimits.clamp(liveExpandedSize, maxWidth: maxSize.width, maxHeight: maxSize.height)
        } else if let selectedPinID, let stored = panelSizes.size(for: selectedPinID, maxWidth: maxSize.width, maxHeight: maxSize.height) {
            layout.expandedSize = stored
        } else {
            layout.expandedSize = PanelSizeLimits.clamp(Theme.Notch.defaultExpandedSize(edge: layout.edge), maxWidth: maxSize.width, maxHeight: maxSize.height)
        }
        return layout
    }

    @objc private func screenParametersChanged() {
        positionPanel()
        if phase == .expanded {
            setPhase(.resting)
        } else {
            refreshContent()
        }
    }

    func edgeDidChange() {
        positionPanel()
        if phase == .expanded {
            setPhase(.resting)
        } else {
            refreshContent()
        }
    }

    // MARK: - Panel resizing

    /// Drives a grip drag from the global mouse position: depth follows the cursor 1:1, and
    /// the length grows symmetrically about the panel's center (2x) so the corner tracks it.
    private func handleResize(_ handle: ResizeHandle, _ event: ResizeEvent) {
        guard phase == .expanded, let pinID = selectedPinID else { return }
        switch event {
        case .began(let translation):
            // Where the press was: the gesture reports only after its minimum distance, which
            // would otherwise leave the edge a few points behind the cursor for the whole drag.
            let mouse = DemoMode.mouseLocation
            let start = CGPoint(x: mouse.x - translation.width, y: mouse.y + translation.height)
            resizeSession = ResizeSession(handle: handle, startMouse: start, startSize: layout.expandedSize)
            notchState.isResizing = true
            panel.ignoresMouseEvents = false
        case .changed:
            guard let session = resizeSession else { return }
            let mouse = DemoMode.mouseLocation
            let dx = mouse.x - session.startMouse.x
            let dy = session.startMouse.y - mouse.y  // screen y grows upward
            var size = session.startSize
            let corner = session.handle != .farEdge
            let second = session.handle == .cornerB
            switch Settings.shared.edge {
            case .right:
                size.width -= dx
                if corner { size.height += (second ? dy : -dy) * 2 }
            case .left:
                size.width += dx
                if corner { size.height += (second ? dy : -dy) * 2 }
            case .top:
                size.height += dy
                // Beside a hardware notch the leading end is fixed: only the trailing corner
                // changes the width (the leading one would move the opposite end).
                if corner, !(anchorLeading && !second) { size.width += (second ? dx : -dx) * (anchorLeading ? 1 : 2) }
            }
            liveExpandedSize = size
            notchState.layout = makeLayout()
        case .ended:
            let final = layout.expandedSize
            let maxSize = layout.maxPanelSize
            panelSizes.set(final, for: pinID, maxWidth: maxSize.width, maxHeight: maxSize.height)
            liveExpandedSize = nil
            resizeSession = nil
            if Settings.shared.edge != .top { expandedCenter = clampedExpandedCenter(for: expandedCenter) }
            notchState.isResizing = false
            refreshContent()
        }
    }

    private func resetPanelSize() {
        guard let pinID = selectedPinID else { return }
        panelSizes.reset(pinID: pinID)
        if Settings.shared.edge != .top { expandedCenter = clampedExpandedCenter(for: expandedCenter) }
        refreshContent()
    }

    func restingPillVisibilityDidChange() {
        refreshContent()
    }

    // MARK: - Settings

    func showSettings(section: SettingsSection = .connection) {
        let controller = settingsWindowController ?? SettingsWindowController(appModel: appModel)
        settingsWindowController = controller
        controller.show(section: section)
    }

    /// A minimal, native prompt for naming a new pin group — deliberately AppKit (`NSAlert`)
    /// rather than a custom SwiftUI sheet, since it needs full keyboard text entry and the
    /// notch's host panel is non-activating.
    private func presentNewGroupPrompt() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "New Group"
        alert.informativeText = "Name this pin group."
        alert.addButton(withTitle: "Create")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
        field.placeholderString = "Group name"
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }
        let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let group = appModel.pinStore.addGroup(name: name, emoji: nil)
        Settings.shared.activeGroupID = group.id
        refreshAfterPinsChanged()
    }

    // MARK: - Add / pinning flow

    /// Opens the notch's add flow from outside the notch (used by onboarding's last step).
    func openAddFlow() {
        presentAddFlow(near: CGRect(x: 0, y: expandedCenter - 1, width: 1, height: 2))
    }

    private func presentAddFlow(near frame: CGRect) {
        guard appModel.hasToken else {
            showSettings()
            return
        }
        showPinSearchPanel(near: frame)
    }

    private func showPinSearchPanel(near frame: CGRect) {
        let view = PinSearchView(
            appModel: appModel,
            onPick: { [weak self] result in
                self?.handlePicked(result)
            },
            onClose: { [weak self] in
                self?.collapse(force: true)
            }
        )
        selectedPinID = nil
        addFlowContent = AnyView(view)
        expandedCenter = clampedExpandedCenter(for: frame.midY)
        setPhase(.expanded)
    }

    private func handlePicked(_ result: SearchResult) {
        switch result.kind {
        case .page:
            let pin = Pin(notionId: result.id, kind: .page, title: result.title.isEmpty ? "Untitled" : result.title, icon: PinIcon(result.icon), order: 0)
            appModel.pinStore.add(pin)
            refreshAfterPinsChanged()
            collapse(force: true)
        case .dataSource:
            showDatabaseSetup(for: result)
        }
    }

    private func showDatabaseSetup(for result: SearchResult) {
        let client = appModel.client
        let view = DatabaseSetupView(
            title: result.title,
            icon: result.icon,
            loadSchema: { try await client.retrieveDataSource(result.id) },
            onSave: { [weak self] config in
                self?.finishPinningDatabase(result: result, config: config)
            },
            onCancel: { [weak self] in
                self?.collapse(force: true)
            },
            saveLabel: appModel.pinStore.pins.contains { $0.notionId == result.id } ? "Pin as new view" : "Pin database",
            onBack: { [weak self] in
                guard let self else { return }
                self.showPinSearchPanel(near: CGRect(x: 0, y: self.expandedCenter - 1, width: 1, height: 2))
            }
        )
        addFlowContent = AnyView(view)
        refreshContent()
    }

    private func finishPinningDatabase(result: SearchResult, config: DatabaseConfig) {
        let baseTitle = result.title.isEmpty ? "Untitled" : result.title
        let pinTitle = (config.viewName?.isEmpty == false) ? "\(baseTitle) \u{00B7} \(config.viewName!)" : baseTitle
        let pin = Pin(notionId: result.id, kind: .dataSource, title: pinTitle, icon: PinIcon(result.icon), order: 0, config: config)
        appModel.pinStore.add(pin)
        refreshAfterPinsChanged()
        collapse(force: true)
    }

    // MARK: - Edit view

    private func presentEditView(for pinItem: PinItem) {
        guard let backingPin = pin(withPinItemID: pinItem.id), backingPin.kind == .dataSource, let config = backingPin.config else { return }
        let client = appModel.client
        let baseTitle = backingPin.title.components(separatedBy: " \u{00B7} ").first ?? backingPin.title
        let view = DatabaseSetupView(
            title: baseTitle,
            icon: .none,
            loadSchema: { try await client.retrieveDataSource(backingPin.notionId) },
            onSave: { [weak self] newConfig in
                guard let self else { return }
                var updated = backingPin
                updated.config = newConfig
                if let name = newConfig.viewName, !name.isEmpty {
                    updated.title = "\(baseTitle) \u{00B7} \(name)"
                } else {
                    updated.title = baseTitle
                }
                self.appModel.pinStore.update(updated)
                self.databaseModels[backingPin.id]?.stopPolling()
                self.databaseModels[backingPin.id] = nil
                self.refreshAfterPinsChanged()
                self.collapse(force: true)
            },
            onCancel: { [weak self] in
                self?.collapse(force: true)
            },
            initialConfig: config,
            saveLabel: "Save view"
        )
        selectedPinID = nil
        addFlowContent = AnyView(view)
        setPhase(.expanded)
    }

    // MARK: - Icon picker

    private func presentIconPicker(for pinItem: PinItem) {
        guard let backingPin = pin(withPinItemID: pinItem.id) else { return }
        let view = IconPickerView(
            pin: backingPin,
            client: appModel.client,
            onSave: { [weak self] updatedPin in
                self?.appModel.pinStore.update(updatedPin)
                self?.refreshAfterPinsChanged()
            },
            onClose: { [weak self] in
                self?.collapse(force: true)
            }
        )
        selectedPinID = nil
        addFlowContent = AnyView(view)
        setPhase(.expanded)
    }

    // MARK: - Selection / phase

    private func selectPin(_ pinItem: PinItem, iconFrame: CGRect) {
        addFlowContent = nil
        if phase == .expanded && selectedPinID == pinItem.id {
            collapse(force: true)
            return
        }
        open(pinItem: pinItem, iconFrameGlobal: iconFrame)
    }

    private func open(pinItem: PinItem, iconFrameGlobal: CGRect?) {
        selectedPinID = pinItem.id
        if !TodayPin.isToday(pinItem.id) { Settings.shared.lastOpenedPinID = pinItem.id }
        if let iconFrameGlobal {
            expandedCenter = clampedExpandedCenter(for: iconFrameGlobal.midY)
        }
        setPhase(.expanded)
        if let backingPin = pin(withPinItemID: pinItem.id) {
            startPolling(for: backingPin)
        }
    }

    private func toggleKeepOpen(for pinItem: PinItem) {
        if selectedPinID == pinItem.id {
            isPanelPinned.toggle()
            refreshContent()
        } else {
            isPanelPinned = true
            addFlowContent = nil
            open(pinItem: pinItem, iconFrameGlobal: nil)
        }
    }

    private func clampedExpandedCenter(for iconMid: CGFloat) -> CGFloat {
        let metrics = makeLayout().metrics(for: .expanded)
        // Keep the body and its flares (plus the margin `maxPanelSize` leaves) inside the window.
        let half = metrics.length / 2 + metrics.flare + 8
        guard windowSize.height > 2 * half else { return windowSize.height / 2 }
        return min(max(iconMid, half), windowSize.height - half)
    }

    /// Sets the phase, updates SwiftUI content (which morphs the shape via its own
    /// `.animation` modifiers) and keeps outside-click monitors / polling in sync.
    private static let phaseLog = Logger(subsystem: "cz.stepanblaha.notiondock", category: "phase")

    private func setPhase(_ newPhase: NotchPhase) {
        if newPhase != phase {
            let caller = Thread.callStackSymbols.dropFirst().prefix(6).joined(separator: " | ")
            Self.phaseLog.notice("phase \(String(describing: self.phase), privacy: .public) -> \(String(describing: newPhase), privacy: .public) via \(caller, privacy: .public)")
        }
        if newPhase != .expanded, phase == .expanded {
            stopPolling()
        }
        if newPhase != .expanded {
            if phase == .expanded, let closedID = selectedPinID {
                PinSummaryService.shared.refresh(pinID: closedID)
            }
            selectedPinID = nil
            isPanelPinned = false
            addFlowContent = nil
        }
        let changed = phase != newPhase
        phase = newPhase
        refreshContent()
        if changed {
            updateOutsideClickMonitors()
        }
        collapseWorkItem?.cancel(); collapseWorkItem = nil
    }

    /// Collapses the expanded panel. `force` bypasses the "keep open" pin (used by the
    /// header's close button); outside clicks / Esc pass `force: false` and are ignored
    /// while pinned.
    private func collapse(force: Bool) {
        guard phase == .expanded else { return }
        if !force, isPanelPinned { return }
        let overStrip = isPointInStripHotZone(currentLocalMousePoint())
        setPhase(overStrip ? .strip : .resting)
    }

    // MARK: - Panel content

    private func panelContent(for pin: Pin) -> AnyView {
        switch pin.kind {
        case .page:
            let model = pageModel(for: pin)
            return AnyView(PageView(model: model, embed: { [weak self] databaseId, _ in
                guard let self else { return AnyView(EmptyView()) }
                return AnyView(EmbeddedDatabaseView(databaseId: databaseId, resolve: self.embeddedModel(databaseId:)))
            }))
        case .dataSource:
            guard let model = databaseModel(for: pin) else {
                return AnyView(Text("Database not configured. Unpin and pin it again.")
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
                    .padding())
            }
            return AnyView(DatabaseTaskView(model: model, pinID: pin.id))
        }
    }

    private func pageModel(for pin: Pin) -> PageViewModel {
        if let model = pageModels[pin.id] { return model }
        let model = PageViewModel(pageId: pin.notionId, pinId: pin.id, client: appModel.client, cache: appModel.cache, writeQueue: appModel.writeQueue)
        pageModels[pin.id] = model
        Task { await model.load() }
        return model
    }

    private func databaseModel(for pin: Pin) -> DatabaseViewModel? {
        if let model = databaseModels[pin.id] { return model }
        guard let config = pin.config else { return nil }
        let model = DatabaseViewModel(dataSourceId: pin.notionId, config: config, cacheKey: pin.id, client: appModel.client, cache: appModel.cache, writeQueue: appModel.writeQueue)
        databaseModels[pin.id] = model
        Task { await model.load() }
        return model
    }

    private func embeddedModel(databaseId: String) async throws -> DatabaseViewModel {
        let key = "embedded-\(databaseId)"
        if let model = databaseModels[key] { return model }
        let model = try await DatabaseViewModel.embedded(childDatabaseId: databaseId, client: appModel.client, cache: appModel.cache, writeQueue: appModel.writeQueue)
        databaseModels[key] = model
        await model.load()
        return model
    }

    private func startPolling(for pin: Pin) {
        stopPolling()
        pollingPinID = pin.id
        pageModels[pin.id]?.startPolling()
        databaseModels[pin.id]?.startPolling()
    }

    private func stopPolling() {
        guard let id = pollingPinID else { return }
        pageModels[id]?.stopPolling()
        databaseModels[id]?.stopPolling()
        pollingPinID = nil
    }

    // MARK: - Pin actions

    /// Marks a to-do / task done straight from the hover peek, through the same write path
    /// as the menu-bar list and widget. Summaries refresh via `.pinContentDidChange`.
    private func checkSummaryItem(pinID: String, itemID: String) {
        // Items ticked in the Today pin's peek belong to whichever pin they came from.
        let pinID = TodayPin.isToday(pinID) ? (PinSummaryService.shared.todayDigest().items.first { $0.id == itemID }?.pinId ?? pinID) : pinID
        guard let pin = appModel.pinStore.pins.first(where: { $0.id == pinID }),
              let operation = InboxCapture.toggleOperation(pin: pin, itemId: itemID, checked: true) else { return }
        SoundService.shared.tick()
        let appModel = appModel
        Task { @MainActor in
            switch await appModel.writeQueue.submit(operation, using: appModel.client) {
            case .saved, .queued:
                NotificationCenter.default.post(name: .pinContentDidChange, object: pinID)
            case .failed(let message):
                CaptureToast.show(message, isError: true)
                NotificationCenter.default.post(name: .pinContentDidChange, object: pinID)
            }
        }
    }

    private func unpin(pinItemID: String) {
        if TodayPin.isToday(pinItemID) { Settings.shared.showTodayPin = false; return }
        appModel.pinStore.remove(id: pinItemID)
        pageModels[pinItemID] = nil
        databaseModels[pinItemID] = nil
        if selectedPinID == pinItemID {
            collapse(force: true)
        }
        refreshAfterPinsChanged()
    }

    private func openPinInNotion(_ backingPin: Pin) {
        let compactID = backingPin.notionId.replacingOccurrences(of: "-", with: "")
        let notionSchemeURL = URL(string: "notion://www.notion.so/\(compactID)")
        let httpsURL = URL(string: "https://www.notion.so/\(compactID)")

        if let notionSchemeURL,
           NSWorkspace.shared.urlForApplication(toOpen: URL(string: "notion://")!) != nil {
            NSWorkspace.shared.open(notionSchemeURL)
        } else if let httpsURL {
            NSWorkspace.shared.open(httpsURL)
        }
    }

    // MARK: - Mouse pass-through / hot zones

    private func installMouseMovedMonitors() {
        globalMouseMovedMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] _ in
            self?.handleMouseMoved()
        }
        localMouseMovedMonitor = NSEvent.addLocalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            self?.handleMouseMoved()
            return event
        }
    }

    /// Window-local point (top-left origin, matching `EdgeNotchShape`'s coordinate space)
    /// for the current global mouse location.
    private func currentLocalMousePoint() -> CGPoint {
        let screenPoint = DemoMode.mouseLocation
        let local = panel.convertPoint(fromScreen: screenPoint)
        return CGPoint(x: local.x, y: windowSize.height - local.y)
    }

    private var layout: NotchLayout { notchState.layout }

    /// Bounding rect of `phase`'s shape plus the hover padding. The resting pill's target is
    /// always the classic line size, whichever pill style is showing.
    private func hotRect(for phase: NotchPhase) -> CGRect {
        let metrics = phase == .resting ? layout.hotRestingMetrics : layout.metrics(for: phase)
        return layout.boundingRect(for: phase, metrics: metrics)
            .insetBy(dx: -Theme.Notch.hotZonePadding, dy: -Theme.Notch.hotZonePadding)
    }

    private func isPointInStripHotZone(_ point: CGPoint) -> Bool {
        hotRect(for: .strip).contains(point)
    }

    private func isPointInRestingHotZone(_ point: CGPoint) -> Bool {
        hotRect(for: .resting).contains(point)
    }

    /// Keeps the transparent area click-through: the window only accepts mouse events while
    /// the cursor sits over the current shape's bounding rect (plus a small hot zone). The
    /// window is much bigger than the shape, expanded included.
    private func updatePassThrough() {
        let point = currentLocalMousePoint()
        var rect = hotRect(for: phase)
        if phase == .strip, notchState.peekPinID != nil { rect = rect.union(peekTooltipRect()) }
        panel.ignoresMouseEvents = resizeSession == nil && !rect.contains(point)
    }

    /// Window-space rect the hover-peek card occupies (on the side away from the screen edge).
    private func peekTooltipRect() -> CGRect {
        layout.peekRect(peekFrame: notchState.peekFrame, itemCount: 3)
    }

    /// "Display with mouse": moves the notch to the screen the cursor is on (only while resting).
    private func followMouseIfNeeded() {
        guard Settings.shared.displayPreference == .mouse, let target = resolveScreen(), target != currentScreen else { return }
        positionPanel()
        refreshContent()
    }

    private func handleMouseMoved() {
        updatePassThrough()
        let point = currentLocalMousePoint()
        switch phase {
        case .resting:
            followMouseIfNeeded()
            if isPointInRestingHotZone(currentLocalMousePoint()) {
                collapseWorkItem?.cancel(); collapseWorkItem = nil
                setPhase(.strip)
            }
        case .strip:
            let overPeek = notchState.peekPinID != nil && peekTooltipRect().insetBy(dx: -8, dy: -8).contains(point)
            if isPointInStripHotZone(point) || overPeek || isMenuTracking || isMouseOverAuxiliaryWindow {
                collapseWorkItem?.cancel(); collapseWorkItem = nil
            } else {
                scheduleCollapseToResting()
            }
        case .expanded:
            collapseWorkItem?.cancel(); collapseWorkItem = nil
        }
    }

    private func scheduleCollapseToResting() {
        guard collapseWorkItem == nil else { return }
        let item = DispatchWorkItem { [weak self] in
            guard let self, self.phase == .strip else { return }
            self.collapseWorkItem = nil
            guard !self.isMenuTracking, !self.isMouseOverAuxiliaryWindow else { return }
            self.setPhase(.resting)
        }
        collapseWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + Theme.Notch.hoverOutDelay, execute: item)
    }

    // MARK: - Activation

    /// App that was frontmost before the notch expanded; focus goes back to it on collapse.
    private var previousApp: NSRunningApplication?

    /// While expanded the app becomes active: macOS only honours cursor changes (hand
    /// cursor on buttons) and full text editing for the active app.
    private func activateForEditing() {
        let front = NSWorkspace.shared.frontmostApplication
        if front?.processIdentifier != ProcessInfo.processInfo.processIdentifier {
            previousApp = front
        }
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
    }

    private func restorePreviousApp() {
        guard NSApp.isActive else { previousApp = nil; return }
        // Only hand focus back if the user didn't click into another app to close us.
        if let previousApp, !previousApp.isTerminated {
            previousApp.activate()
        }
        previousApp = nil
    }

    // MARK: - Outside click / Esc collapse

    private func updateOutsideClickMonitors() {
        if phase == .expanded {
            installOutsideClickMonitors()
            activateForEditing()
        } else {
            removeOutsideClickMonitors()
            restorePreviousApp()
        }
    }

    private func installOutsideClickMonitors() {
        guard globalClickMonitor == nil else { return }

        globalClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.handleGlobalClick()
        }

        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            self?.handleLocalClick(event)
            return event
        }

        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            if event.keyCode == 53 { // Esc
                self.collapse(force: false)
                return nil
            }
            return event
        }
    }

    private func removeOutsideClickMonitors() {
        if let globalClickMonitor {
            NSEvent.removeMonitor(globalClickMonitor)
            self.globalClickMonitor = nil
        }
        if let localClickMonitor {
            NSEvent.removeMonitor(localClickMonitor)
            self.localClickMonitor = nil
        }
        if let localKeyMonitor {
            NSEvent.removeMonitor(localKeyMonitor)
            self.localKeyMonitor = nil
        }
    }

    /// A click macOS delivered to another app. If it actually landed on the notch, the
    /// click-through flag was stale (it only refreshes on mouse moves): don't fold, just
    /// start accepting clicks again.
    private func handleGlobalClick() {
        let point = currentLocalMousePoint()
        if hotRect(for: phase).contains(point) {
            Self.phaseLog.notice("global click inside notch at \(point.debugDescription, privacy: .public); ignoring (stale pass-through)")
            panel.ignoresMouseEvents = false
            return
        }
        collapse(force: false)
    }

    private func handleLocalClick(_ event: NSEvent) {
        guard let window = event.window else { return }
        if window == panel || Self.isAuxiliary(window) { return }
        collapse(force: false)
    }

    // MARK: - Menus & popovers
    //
    // Context menus, their submenus and SwiftUI popovers open in their own windows, often
    // outside the strip's hot zone. While one is up the notch must stay open, or folding it
    // would tear the menu down mid-hover.

    private var isMenuTracking = false

    @objc private func menuDidBeginTracking(_ note: Notification) {
        isMenuTracking = true
        collapseWorkItem?.cancel(); collapseWorkItem = nil
    }

    @objc private func menuDidEndTracking(_ note: Notification) {
        isMenuTracking = false
        handleMouseMoved()
    }

    /// Untitled windows of this app other than the notch itself: popovers and menus.
    private static func isAuxiliary(_ window: NSWindow) -> Bool {
        !window.styleMask.contains(.titled) && !(window is NotchPanel)
    }

    private var isMouseOverAuxiliaryWindow: Bool {
        let location = DemoMode.mouseLocation
        return NSApp.windows.contains { $0.isVisible && Self.isAuxiliary($0) && $0.frame.contains(location) }
    }
}

// MARK: - Today
extension DockController {
    fileprivate func todayContent() -> AnyView {
        AnyView(TodayView(model: todayModel))
    }

    /// The "Show Today pin" setting flipped: rebuild the strip (and close Today if it was open).
    fileprivate func todayPinSettingDidChange() {
        if !Settings.shared.showTodayPin, TodayPin.isToday(selectedPinID) { collapse(force: true) }
        positionPanel()
        refreshContent()
    }
}

// MARK: - Reminders
extension DockController {
    fileprivate func startReminders() {
        ItemActions.shared.configure(appModel: appModel)
        RowPageRouter.shared.configure(appModel: appModel)
        ReminderService.shared.start(appModel: appModel)
        NotificationCenter.default.addObserver(forName: .reminderPeekRequested, object: nil, queue: .main) { [weak self] note in
            guard let pinID = note.object as? String else { return }
            MainActor.assumeIsolated { self?.peekForReminder(pinID: pinID) }
        }
        NotificationCenter.default.addObserver(forName: .todayPinSettingChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.todayPinSettingDidChange() }
        }
    }

    /// A reminder fired while the app runs: unfold the strip with the peek card on that pin for 3 s.
    fileprivate func peekForReminder(pinID: String) {
        guard phase != .expanded, pins.contains(where: { $0.id == pinID }) else { return }
        if phase == .resting { setPhase(.strip) }
        guard let frame = demoIconFrame(pinID: pinID) else { return }
        notchState.peekFrame = frame
        notchState.peekPinID = pinID
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.notchState.peekPinID == pinID else { return }
            self.notchState.peekPinID = nil
            if self.phase == .strip, !self.isMenuTracking, !self.isPointInStripHotZone(self.currentLocalMousePoint()) {
                self.setPhase(.resting)
            }
        }
    }
}

// MARK: - Demo
// Hooks for `Features/Demo/DemoDirector` (scripted marketing recordings, demo mode only). They
// drive the same state changes a real hover/click would, without needing the real mouse.
extension DockController {
    var demoPanel: NSWindow { panel }
    var demoPhase: NotchPhase { phase }

    func demoSetPhase(_ newPhase: NotchPhase) {
        if newPhase != .expanded { addFlowContent = nil }
        setPhase(newPhase)
    }

    /// Window-local (top-left origin) frame of a pin's strip icon; mirrors `openPinRequested`.
    func demoIconFrame(pinID: String) -> CGRect? {
        guard let index = pins.firstIndex(where: { $0.id == pinID }) else { return nil }
        let m = Theme.Notch.self
        let strip = layout.bodyRect(for: .strip)
        let switcher = m.iconSize + m.iconSpacing + 6 * Settings.shared.size.metricsScale
        let offset = m.stripPadding + switcher + CGFloat(index) * (m.iconSize + m.iconSpacing) + m.iconSize / 2
        if Settings.shared.edge == .top {
            let midY = topInset + (strip.height - topInset) / 2
            return CGRect(x: strip.minX + offset - m.iconSize / 2, y: midY - m.iconSize / 2, width: m.iconSize, height: m.iconSize)
        }
        let mid = strip.minY + offset
        let midX = strip.midX
        return CGRect(x: midX - m.iconSize / 2, y: mid - m.iconSize / 2, width: m.iconSize, height: m.iconSize)
    }

    /// Window-local (top-left origin) point → global AppKit screen point.
    func demoScreenPoint(_ local: CGPoint) -> CGPoint {
        CGPoint(x: panel.frame.minX + local.x, y: panel.frame.maxY - local.y)
    }

    /// Where the resting pill sits on screen.
    var demoRestingPoint: CGPoint {
        let rect = layout.bodyRect(for: .resting)
        return demoScreenPoint(CGPoint(x: rect.midX, y: rect.midY))
    }

    /// Screen rect of `phase`'s shape body (for aiming the fake cursor at panel contents).
    func demoScreenRect(for phase: NotchPhase) -> CGRect {
        let rect = layout.bodyRect(for: phase)
        return CGRect(x: panel.frame.minX + rect.minX, y: panel.frame.maxY - rect.maxY, width: rect.width, height: rect.height)
    }

    /// Screen rect of the hover-peek card for `itemCount` rows.
    func demoPeekScreenRect(itemCount: Int) -> CGRect {
        let rect = layout.peekRect(peekFrame: notchState.peekFrame, itemCount: itemCount)
        return CGRect(x: panel.frame.minX + rect.minX, y: panel.frame.maxY - rect.maxY, width: rect.width, height: rect.height)
    }

    func demoShowPeek(pinID: String?) {
        guard let pinID, let frame = demoIconFrame(pinID: pinID) else {
            notchState.peekPinID = nil
            return
        }
        notchState.peekFrame = frame
        notchState.peekPinID = pinID
    }

    func demoOpen(pinID: String) {
        guard let item = pins.first(where: { $0.id == pinID }) else { return }
        addFlowContent = nil
        refreshContent()
        open(pinItem: item, iconFrameGlobal: demoIconFrame(pinID: pinID))
    }

    /// Probe: opens the add flow (`db` = straight to a database's setup step).
    func demoOpenAddFlow(database: Bool) {
        if database {
            showDatabaseSetup(for: SearchResult(id: DemoContent.sprintDataSource, kind: .dataSource, title: "Sprint", icon: .emoji("\u{1F3C3}"), url: nil))
            expandedCenter = clampedExpandedCenter(for: expandedCenter)
            setPhase(.expanded)
        } else {
            openAddFlow()
        }
    }

    func demoTextView(pinID: String) -> EditorTextView? {
        pageModels[pinID]?.document.textView as? EditorTextView
    }

    func demoDatabaseModel(pinID: String) -> DatabaseViewModel? {
        databaseModels[pinID]
    }
}

// MARK: - Demo probe
extension DockController {
    /// The expanded panel's body rect, window-local (top-left origin).
    var demoExpandedBody: CGRect { layout.bodyRect(for: .expanded) }

    /// One-line-per-fact state for the probe harness.
    func demoStateDump() -> String {
        let screen = currentScreen
        func screenRect(_ r: CGRect) -> CGRect {
            CGRect(x: panel.frame.minX + r.minX, y: panel.frame.maxY - r.maxY, width: r.width, height: r.height)
        }
        var lines = [
            "phase \(phase) selected \(selectedPinID ?? "-") edge \(Settings.shared.edge.rawValue) merge \(Settings.shared.mergeWithHardwareNotch)",
            "panel \(panel.frame) windowSize \(windowSize) ignoresMouse \(panel.ignoresMouseEvents)",
            "screen \(screen?.frame ?? .zero) visible \(screen?.visibleFrame ?? .zero) safeTop \(screen?.safeAreaInsets.top ?? 0)",
            "anchor \(layoutAnchor) leading \(anchorLeading) topInset \(topInset) mergedWidth \(mergedWidth.map { "\($0)" } ?? "nil")",
            "expandedSize \(layout.expandedSize) max \(layout.maxPanelSize) stored \(selectedPinID.flatMap { panelSizes.hasSize(for: $0) ? "yes" : "no" } ?? "-")",
        ]
        for p in [NotchPhase.resting, .strip, .expanded] {
            lines.append("\(p) body \(screenRect(layout.bodyRect(for: p))) bounding \(screenRect(layout.boundingRect(for: p, metrics: layout.metrics(for: p)))) hot \(screenRect(hotRect(for: p)))")
        }
        return lines.joined(separator: "\n")
    }
}
