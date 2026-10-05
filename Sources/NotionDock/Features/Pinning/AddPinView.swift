import SwiftUI
import NotionKit

/// The add-a-pin panel: a source switch (Notion / Apple Notes) over the matching picker.
struct AddPinView: View {
    let appModel: AppModel
    let onPickNotion: (SearchResult) -> Void
    let onPickNotes: (NotesPick) -> Void
    let onClose: () -> Void

    @State private var source: PinSource

    init(appModel: AppModel, onPickNotion: @escaping (SearchResult) -> Void, onPickNotes: @escaping (NotesPick) -> Void, onClose: @escaping () -> Void) {
        self.appModel = appModel
        self.onPickNotion = onPickNotion
        self.onPickNotes = onPickNotes
        self.onClose = onClose
        // Notion stays the default; without a Notion connection Apple Notes is the useful one.
        _source = State(initialValue: appModel.hasToken ? .notion : .appleNotes)
    }

    var body: some View {
        VStack(spacing: 0) {
            AddFlowHeader(title: "Add a pin", onClose: onClose)
            Picker("Source", selection: $source) {
                Text("Notion").tag(PinSource.notion)
                Text("Apple Notes").tag(PinSource.appleNotes)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, Theme.Metrics.hPadding)
            .padding(.top, 8)
            switch source {
            case .notion:
                if appModel.hasToken {
                    PinSearchView(appModel: appModel, onPick: onPickNotion, onClose: onClose, showsHeader: false)
                } else {
                    NotionNotConnectedView()
                }
            case .appleNotes:
                NotesPinPickerView(appModel: appModel, onPick: onPickNotes)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

private struct NotionNotConnectedView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("Notion isn't connected. Connect it in Settings → Connection, or use Apple Notes.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// What the Apple Notes picker returns: a whole folder or one note.
enum NotesPick {
    case folder(NotesFolder)
    case note(NotesNoteInfo)
}
