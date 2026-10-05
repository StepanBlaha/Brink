import Foundation
import Observation
import NotionKit

/// State + save logic behind the quick-capture box.
@MainActor
@Observable
final class QuickCaptureModel {
    static let lastPinKey = "NotionDock.quickCapture.lastPinID"

    var text = ""
    var destinationID: String? {
        didSet { if let destinationID { UserDefaults.standard.set(destinationID, forKey: Self.lastPinKey) } }
    }
    var errorMessage: String?
    private(set) var isSaving = false
    /// Date property names resolved from a schema, keyed by pin id (`""` = none).
    private var fetchedDateProperties: [String: String] = [:]

    private let appModel: AppModel

    init(appModel: AppModel) {
        self.appModel = appModel
        reloadDestination()
    }

    var pins: [Pin] { appModel.pinStore.pins }
    var destination: Pin? { pins.first { $0.id == destinationID } }

    /// Falls back to the first pin when the remembered destination is gone.
    func reloadDestination() {
        let saved = UserDefaults.standard.string(forKey: Self.lastPinKey)
        if let id = destinationID ?? saved, pins.contains(where: { $0.id == id }) {
            destinationID = id
        } else {
            destinationID = pins.first?.id
        }
        Task { await resolveDateProperty() }
    }

    var dateProperty: String? {
        guard let pin = destination, pin.source == .notion, pin.kind == .dataSource else { return nil }
        if let name = pin.config?.dateProperty { return name }
        let fetched = fetchedDateProperties[pin.id]
        return fetched?.isEmpty == false ? fetched : nil
    }

    /// Live preview of the parsed date (databases with a date property only).
    var datePreview: NaturalDateResult? {
        guard dateProperty != nil else { return nil }
        let parsed = NaturalDate.parse(text)
        return parsed.date == nil ? nil : parsed
    }

    func resolveDateProperty() async {
        guard let pin = destination, pin.source == .notion, pin.kind == .dataSource, pin.config?.dateProperty == nil,
              fetchedDateProperties[pin.id] == nil else { return }
        let schema = try? await appModel.client.retrieveDataSource(pin.notionId)
        fetchedDateProperties[pin.id] = schema?.properties.first { $0.type == "date" }?.name ?? ""
    }

    enum SaveResult { case saved(String), failed }

    /// Saves the current text. `.saved` carries the toast message.
    func save() async -> SaveResult {
        guard let pin = destination else {
            errorMessage = "Pin a page or database first."
            return .failed
        }
        if pin.source == .appleNotes { return await saveToNotes(pin) }
        guard let plan = CaptureRequest.plan(text: text, pin: pin, dateProperty: dateProperty) else { return .failed }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        switch await appModel.writeQueue.submit(plan.operation, using: appModel.client) {
        case .saved:
            NotificationCenter.default.post(name: .pinContentDidChange, object: pin.id)
            text = ""
            return .saved("Added to \(pin.title) ✓")
        case .queued:
            text = ""
            return .saved("Saved offline, will sync")
        case .failed(let message):
            errorMessage = message
            return .failed
        }
    }

    /// Apple Notes destinations: a folder gets a new note titled by the first line, a note pin
    /// gets the text appended. Goes straight to Notes (local), no offline queue needed.
    private func saveToNotes(_ pin: Pin) async -> SaveResult {
        guard let plan = NotesCapture.plan(text: text, pin: pin) else { return .failed }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let message = try await NotesCapture.execute(plan, pinTitle: pin.title, provider: appModel.notes)
            NotificationCenter.default.post(name: .pinContentDidChange, object: pin.id)
            text = ""
            return .saved(message)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            return .failed
        }
    }
}
