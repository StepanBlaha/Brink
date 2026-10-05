import SwiftUI

/// Resolves a database placed inside a page, then shows it as a compact task list.
struct EmbeddedDatabaseView: View {
    let databaseId: String
    let resolve: (String) async throws -> DatabaseViewModel

    @State private var model: DatabaseViewModel?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let model {
                DatabaseTaskView(model: model, pinID: "embedded-\(databaseId)", compact: true)
            } else if let errorMessage {
                Text(errorMessage)
                    .font(Theme.Font.small)
                    .foregroundStyle(Theme.Color.secondaryText)
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: databaseId) {
            do {
                model = try await resolve(databaseId)
            } catch {
                errorMessage = "Couldn't load database. Check your connection and try again. (\(error.localizedDescription))"
            }
        }
    }
}
