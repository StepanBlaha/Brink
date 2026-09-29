import AppKit
import NotionKit

/// The "full" timeline: hover → strip → peek + tick → tasks → editor → quick capture → menu bar.
extension DemoDirector {
    func runFull() async {
        await peekAndTick()
        await sprintTasks()
        await editLaunchPlan()
        await quickCapture()
        await menuBarList()
        // Settle back to the opening frame so the hero video loops cleanly.
        DemoMode.mark("seg-outro")
        await move(to: at(0.42, 0.42), 1.0)
        await DemoUI.sleep(1.0)
    }

    private func iconPoint(_ pinID: String) -> CGPoint? {
        dock.demoIconFrame(pinID: pinID).map { dock.demoScreenPoint(CGPoint(x: $0.midX, y: $0.midY)) }
    }

    private func peekAndTick() async {
        DemoMode.mark("seg-peek")
        await DemoUI.sleep(0.6)
        await move(to: dock.demoRestingPoint, 1.2)
        await DemoUI.sleep(0.25)
        dock.demoSetPhase(.strip)
        await DemoUI.sleep(0.8)
        await move(to: iconPoint(DemoContent.groceriesPinID), 0.55, shape: .hand)
        await DemoUI.sleep(0.55)
        dock.demoShowPeek(pinID: DemoContent.groceriesPinID)
        await DemoUI.sleep(1.1)
        await shot("1-peek")
        // The first peek row's checkbox (PeekTooltip's layout at the current size).
        let card = dock.demoPeekScreenRect(itemCount: 3)
        let scale = Settings.shared.size.fontScale
        let rowY = card.maxY - (10 + 28 * scale + 12 + 7.5 * scale) + 3
        let target = CGPoint(x: card.minX + 18, y: rowY)
        log("peek card \(card) target \(target)")
        await move(to: target, 0.6, shape: .hand)
        await DemoUI.sleep(0.3)
        await click()
        DemoUI.sendClick(at: target, in: panelWindow)
        await DemoUI.sleep(1.6)
    }

    private func sprintTasks() async {
        DemoMode.mark("seg-tasks")
        dock.demoShowPeek(pinID: nil)
        await move(to: iconPoint(DemoContent.sprintPinID), 0.5, shape: .hand)
        await DemoUI.sleep(0.35)
        await click()
        dock.demoOpen(pinID: DemoContent.sprintPinID)
        await DemoUI.sleep(1.3)
        let rowTitle = "Fix sync after sleep"
        let panelRect = dock.demoScreenRect(for: .expanded)
        log("expanded rect \(panelRect)")
        let fallback = CGPoint(x: panelRect.minX + 20, y: panelRect.maxY - 125)
        let row = DemoUI.element(rowTitle, in: panelWindow)
        await move(to: DemoUI.frame(row).map { CGPoint(x: $0.minX - 17, y: $0.midY) } ?? fallback, 0.8, shape: .hand)
        await DemoUI.sleep(0.4)
        // Ask for the still a moment before the tick lands, so it shows the box mid-tick.
        // The still shows the cursor on the box (a ticked row fades out too fast to catch).
        await shot("2-tasks")
        await click()
        if let model = dock.demoDatabaseModel(pinID: DemoContent.sprintPinID),
           let id = model.rows.first(where: { $0.title == rowTitle })?.id {
            Task { await model.toggleDone(id) }
        }
        await DemoUI.sleep(1.4)
    }

    private func editLaunchPlan() async {
        DemoMode.mark("seg-editor")
        dock.demoSetPhase(.strip)
        await DemoUI.sleep(0.6)
        await move(to: iconPoint(DemoContent.launchPinID), 0.6, shape: .hand)
        await DemoUI.sleep(0.3)
        await click()
        dock.demoOpen(pinID: DemoContent.launchPinID)
        await DemoUI.sleep(1.2)
        guard let textView = dock.demoTextView(pinID: DemoContent.launchPinID) else { return }
        panelWindow.makeKeyAndOrderFront(nil)
        panelWindow.makeFirstResponder(textView)
        let end = (textView.string as NSString).length
        await move(to: DemoUI.point(ofCharacterAt: end, in: textView).map { CGPoint(x: $0.x + 40, y: $0.y) }, 0.8, shape: .iBeam)
        await click()
        textView.setSelectedRange(NSRange(location: end, length: 0))
        await DemoUI.sleep(0.4)
        cursor.setVisible(false)

        await DemoUI.type("[] Ship the beta", into: textView)
        await DemoUI.sleep(0.35)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: textView)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: textView)
        await DemoUI.sleep(0.3)
        await DemoUI.type("## Next", into: textView)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: textView)
        await DemoUI.sleep(0.25)
        await DemoUI.type("Invite the **first 50** users", into: textView)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: textView)
        await DemoUI.sleep(0.4)
        await DemoUI.type("/", into: textView)
        await DemoUI.sleep(0.7)
        await DemoUI.type("to", into: textView, baseDelay: 0.16)
        await DemoUI.sleep(0.6)
        await shot("4-slash")
        await DemoUI.sleep(0.5)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: textView)
        await DemoUI.sleep(0.3)
        await DemoUI.type("Book the launch dinner", into: textView)
        await DemoUI.sleep(0.6)

        // Tick "Record the demo video" with the cursor.
        cursor.setVisible(true)
        let location = (textView.string as NSString).range(of: "Record the demo video").location
        if location != NSNotFound {
            await move(to: DemoUI.point(ofCharacterAt: location, in: textView).map { CGPoint(x: $0.x - 16, y: $0.y) }, 0.8, shape: .hand)
            await DemoUI.sleep(0.3)
            await click()
            textView.commands?.toggleCheckbox(paragraphAt: location)
            await DemoUI.sleep(0.9)
        }
        await shot("3-editor")
        let close = DemoUI.element("Close", in: panelWindow)
        let body = dock.demoScreenRect(for: .expanded)
        log("editor expanded rect \(body)")
        await move(to: DemoUI.center(close) ?? CGPoint(x: body.maxX - 94, y: body.maxY - 23), 0.7, shape: .hand)
        await DemoUI.sleep(0.3)
        await click()
        dock.demoSetPhase(.resting)
        await DemoUI.sleep(0.4)
        await move(to: at(0.45, 0.5), 0.9)
        await DemoUI.sleep(0.5)
    }

    private func quickCapture() async {
        DemoMode.mark("seg-capture")
        Task { await keyHUD.show("⌥  ⇧  Space", on: screen, for: 1.1) }
        await DemoUI.sleep(0.45)
        NotificationCenter.default.post(name: .quickCaptureRequested, object: nil)
        await DemoUI.sleep(0.7)
        guard let panel = capturePanel else { return }
        let field = panel.firstResponder as? NSTextView
        await DemoUI.type("Call Anna tomorrow 5pm", into: field)
        await DemoUI.sleep(1.0)
        await shot("5-capture")
        await DemoUI.sleep(0.4)
        DemoUI.key(#selector(NSResponder.insertNewline(_:)), in: field)
        await DemoUI.sleep(1.8)
    }

    private func menuBarList() async {
        DemoMode.mark("seg-menubar")
        let anchor = backdrop.menuBarAnchor
        let frame = anchor.window?.convertToScreen(anchor.convert(anchor.bounds, to: nil)) ?? .zero
        await move(to: CGPoint(x: frame.midX, y: frame.midY), 1.1)
        await DemoUI.sleep(0.25)
        await click()
        menuBar.showForDemo(anchor: anchor)
        await DemoUI.sleep(0.9)
        let section = DemoUI.element("Sprint", in: popoverWindow)
        let pop = popoverWindow?.frame ?? .zero
        log("menubar popover \(pop)")
        if let point = DemoUI.center(section) ?? (pop == .zero ? nil : CGPoint(x: pop.minX + 70, y: pop.maxY - 150)) {
            await move(to: point, 0.6, shape: .hand)
            await DemoUI.sleep(0.2)
            await click()
        }
        menuBar.expandForDemo(pinID: DemoContent.sprintPinID)
        await DemoUI.sleep(1.1)
        await shot("6-menubar")
        await DemoUI.sleep(1.2)
        menuBar.closeForDemo()
        await DemoUI.sleep(0.4)
    }
}
