import SwiftUI
import WidgetKit

@main
struct BrinkWidgetBundle: WidgetBundle {
    var body: some Widget {
        BrinkPinsWidget()
    }
}

struct BrinkPinsWidget: Widget {
    static let kind = "BrinkPinsWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Self.kind, intent: PinWidgetConfigIntent.self, provider: PinTimelineProvider()) { entry in
            PinWidgetView(entry: entry)
        }
        .configurationDisplayName("Brink Pins")
        .description("Open items from a pinned Notion page or database. Check them off right here.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
