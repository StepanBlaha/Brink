import AppKit

/// Accessory apps have no visible menu bar, but ⌘C/⌘V/⌘A/⌘Z only work when
/// matching items exist in `NSApp.mainMenu`, so install a standard Edit menu.
@MainActor
enum MainMenu {
    static func install() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        let about = appMenu.addItem(withTitle: "About Brink", action: #selector(AppWindows.showAbout), keyEquivalent: "")
        about.target = AppWindows.shared
        appMenu.addItem(.separator())
        let settings = appMenu.addItem(withTitle: "Brink Settings…", action: #selector(AppWindows.openSettings), keyEquivalent: ",")
        settings.target = AppWindows.shared
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Brink", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenu.addItem(.separator())
        // Find (routed through the responder chain to the page editor's find bar).
        let find = editMenu.addItem(withTitle: "Find…", action: #selector(NSTextView.performFindPanelAction(_:)), keyEquivalent: "f")
        find.tag = Int(NSFindPanelAction.showFindPanel.rawValue)
        let findNext = editMenu.addItem(withTitle: "Find Next", action: #selector(NSTextView.performFindPanelAction(_:)), keyEquivalent: "g")
        findNext.tag = Int(NSFindPanelAction.next.rawValue)
        let findPrevious = editMenu.addItem(withTitle: "Find Previous", action: #selector(NSTextView.performFindPanelAction(_:)), keyEquivalent: "g")
        findPrevious.keyEquivalentModifierMask = [.command, .shift]
        findPrevious.tag = Int(NSFindPanelAction.previous.rawValue)
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let helpItem = NSMenuItem()
        let helpMenu = NSMenu(title: "Help")
        for (title, action) in [("Brink Help", #selector(AppWindows.openHelp)), ("Send Feedback…", #selector(AppWindows.sendFeedback)),
                                ("Privacy Policy", #selector(AppWindows.showPrivacy)), ("Terms of Use", #selector(AppWindows.showTerms))] {
            helpMenu.addItem(withTitle: title, action: action, keyEquivalent: "").target = AppWindows.shared
        }
        helpItem.submenu = helpMenu
        mainMenu.addItem(helpItem)
        NSApp.helpMenu = helpMenu

        NSApp.mainMenu = mainMenu
    }
}
