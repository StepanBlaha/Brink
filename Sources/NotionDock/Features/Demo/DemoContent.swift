import Foundation
import NotionKit

/// The believable, entirely fictional sample workspace shown in demo mode.
enum DemoContent {
    static let groceriesPinID = "demo-groceries"
    static let launchPinID = "demo-launch"
    static let sprintPinID = "demo-sprint"
    static let readingPinID = "demo-reading"

    static let groceriesPage = "demo-page-groceries"
    static let launchPage = "demo-page-launch"
    static let readingPage = "demo-page-reading"
    static let sprintDataSource = "demo-ds-sprint"

    static var pins: [Pin] {
        [
            Pin(id: groceriesPinID, notionId: groceriesPage, kind: .page, title: "Groceries", icon: .emoji("🛒"), order: 0),
            Pin(id: launchPinID, notionId: launchPage, kind: .page, title: "Launch plan", icon: .emoji("🚀"), order: 1),
            Pin(id: sprintPinID, notionId: sprintDataSource, kind: .dataSource, title: "Sprint", icon: .emoji("🏃"), order: 2,
                config: DatabaseConfig(doneProperty: "Done", doneKind: .checkbox, dateProperty: "Due")),
            Pin(id: readingPinID, notionId: readingPage, kind: .page, title: "Reading", icon: .emoji("📚"), order: 3),
        ]
    }

    /// A block seed: Notion type, text, extra fields for the type's box, children.
    struct B {
        var type: String
        var text: String
        var extra: [String: Any] = [:]
        var children: [B] = []

        static func p(_ t: String) -> B { B(type: "paragraph", text: t) }
        static func h2(_ t: String) -> B { B(type: "heading_2", text: t) }
        static func todo(_ t: String, _ done: Bool = false) -> B { B(type: "to_do", text: t, extra: ["checked": done]) }
        static func bullet(_ t: String) -> B { B(type: "bulleted_list_item", text: t) }
        static func toggle(_ t: String, _ kids: [B]) -> B { B(type: "toggle", text: t, children: kids) }
        static func callout(_ t: String, _ emoji: String) -> B {
            B(type: "callout", text: t, extra: ["icon": ["type": "emoji", "emoji": emoji], "color": "gray_background"])
        }
    }

    static let pages: [String: (emoji: String, blocks: [B])] = [
        groceriesPage: ("🛒", [
            .todo("Oat milk"),
            .todo("Sourdough bread"),
            .todo("Basil and cherry tomatoes"),
            .todo("Coffee beans"),
            .todo("Lemons", true),
        ]),
        launchPage: ("🚀", [
            .callout("Beta goes out to 200 testers on Friday.", "💡"),
            .h2("This week"),
            .todo("Finish onboarding copy", true),
            .todo("Record the demo video"),
            .todo("Send invites to testers"),
            .h2("Notes"),
            .bullet("Keep the changelog short and friendly"),
            .bullet("One price, no subscription"),
            .toggle("Open questions", [.bullet("Do we need a Windows version?"), .bullet("Which launch day works best?")]),
            .p(""),
        ]),
        readingPage: ("📚", [
            .todo("The Design of Everyday Things"),
            .todo("Four Thousand Weeks"),
            .todo("Piranesi"),
            .todo("A Psalm for the Wild-Built", true),
        ]),
    ]

    /// Sprint rows: (title, status, due offset in days from today, done).
    static let sprintRows: [(String, String, Int?, Bool)] = [
        ("Polish onboarding screens", "In progress", 0, false),
        ("Fix sync after sleep", "In progress", 0, false),
        ("Write release notes", "Not started", 0, false),
        ("Review pricing page", "Not started", 1, false),
        ("Plan the retro", "Not started", 3, false),
        ("Update the app icon", "Done", -1, true),
    ]

    static let statusOptions: [[String: Any]] = [
        ["id": "st-1", "name": "Not started", "color": "default"],
        ["id": "st-2", "name": "In progress", "color": "blue"],
        ["id": "st-3", "name": "Done", "color": "green"],
    ]

    static func dayString(offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
