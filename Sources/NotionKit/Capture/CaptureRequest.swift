import Foundation

/// Maps quick-capture input plus a destination pin to the queued write that saves it.
public enum CaptureRequest {
    public struct Plan: Equatable, Sendable {
        public let operation: PendingWrite.Operation
        /// The title/text actually saved (date phrase stripped for databases).
        public let savedText: String
    }

    /// - Parameter dateProperty: the destination database's date property (from the pin's
    ///   config, else the schema's first date property). `nil` disables date parsing.
    public static func plan(text: String, pin: Pin, dateProperty: String?, now: Date = Date(), calendar: Calendar = .current) -> Plan? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        switch pin.kind {
        case .page:
            let block = MarkdownParser.detectPrefixedBlock(trimmed)
                ?? .formatted(.toDo, richText: MarkdownParser.spans(from: trimmed), checked: false)
            return Plan(operation: .appendBlock(parentId: pin.notionId, block: block), savedText: trimmed)
        case .dataSource:
            var title = trimmed
            var extra: [PropertyUpdate] = []
            if let dateProperty {
                let parsed = NaturalDate.parse(trimmed, now: now, calendar: calendar)
                if let date = parsed.date {
                    title = parsed.cleanTitle
                    let iso = NaturalDate.isoString(date, hasTime: parsed.hasTime, timeZone: calendar.timeZone)
                    extra = [PropertyUpdate(name: dateProperty, value: .date(start: iso, end: nil))]
                }
            }
            return Plan(operation: .createRow(dataSourceId: pin.notionId, title: title, extra: extra), savedText: title)
        }
    }
}
