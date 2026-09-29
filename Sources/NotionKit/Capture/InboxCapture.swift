import Foundation

/// Maps a Share-extension / widget `capture` inbox action to the same queued write the
/// quick-capture box produces (`CaptureRequest.plan`).
public enum InboxCapture {
    /// The text actually captured: the note, with the URL attached as a Markdown link for pages
    /// (so it lands as a linked to-do) or appended plainly for database titles.
    public static func captureText(text: String, url: String?, kind: PinKind) -> String {
        let note = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = url?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty else { return note }
        if note.contains(url) { return note }
        if note.isEmpty { return url }
        switch kind {
        case .page:
            let label = note.replacingOccurrences(of: "[", with: "(").replacingOccurrences(of: "]", with: ")")
            return "[\(label)](\(url))"
        case .dataSource:
            return "\(note) \(url)"
        }
    }

    /// Destination: the requested pin, else the fallback (last quick-capture pin), else the first pin.
    public static func destination(pinId: String?, pins: [Pin], fallbackID: String?) -> Pin? {
        if let pinId, let pin = pins.first(where: { $0.id == pinId }) { return pin }
        if let fallbackID, let pin = pins.first(where: { $0.id == fallbackID }) { return pin }
        return pins.sorted { $0.order < $1.order }.first
    }

    public static func plan(text: String, url: String?, pinId: String?, pins: [Pin], fallbackID: String?,
                            now: Date = Date(), calendar: Calendar = .current) -> (pin: Pin, plan: CaptureRequest.Plan)? {
        guard let pin = destination(pinId: pinId, pins: pins, fallbackID: fallbackID) else { return nil }
        let combined = captureText(text: text, url: url, kind: pin.kind)
        guard let plan = CaptureRequest.plan(text: combined, pin: pin, dateProperty: pin.config?.dateProperty, now: now, calendar: calendar) else { return nil }
        return (pin, plan)
    }

    /// Menu-bar tick semantics: page → `to_do.checked`; database → the done property.
    public static func toggleOperation(pin: Pin, itemId: String, checked: Bool) -> PendingWrite.Operation? {
        switch pin.kind {
        case .page:
            return .updateBlock(blockId: itemId, type: "to_do", update: .checked(checked))
        case .dataSource:
            guard let config = pin.config else { return nil }
            switch config.doneKind {
            case .checkbox:
                return .toggleDone(pageId: itemId, update: PropertyUpdate(name: config.doneProperty, value: .checkbox(checked)))
            case .status:
                // Un-done needs the schema's first non-done option; only "mark done" is supported here.
                guard checked, let done = config.doneValue else { return nil }
                return .toggleDone(pageId: itemId, update: PropertyUpdate(name: config.doneProperty, value: .status(name: done)))
            }
        }
    }
}
