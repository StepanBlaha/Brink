import Foundation

/// External destinations used by the About window and the Help entries.
enum Links {
    static let website = URL(string: "https://stepanblaha.github.io/Brink/")!
    static let help = URL(string: "https://stepanblaha.github.io/Brink/#faq")!
    static let feedbackEmail = "stepa15.b@gmail.com"
    static let download = URL(string: "https://github.com/StepanBlaha/Brink/releases/latest")!
    static var feedback: URL {
        URL(string: "mailto:\(feedbackEmail)?subject=Brink%20feedback")!
    }
    static let notionIntegrations = URL(string: "https://www.notion.so/profile/integrations")!

    /// True while the website links are still placeholders, so legal pages open in-app instead.
    static var websiteIsPlaceholder: Bool { website.host?.hasSuffix(".example") ?? true }
}
