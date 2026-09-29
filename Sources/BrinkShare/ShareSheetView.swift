import SwiftUI

/// The black Brink capture sheet shown by the Share extension.
struct ShareSheetView: View {
    @ObservedObject var model: ShareModel
    let onCancel: () -> Void
    let onSave: () -> Void

    private static let accent = Color(red: 10 / 255, green: 132 / 255, blue: 1)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Save to Brink").font(.system(size: 14, weight: .semibold))
                Spacer()
                Picker("", selection: $model.pinID) {
                    Text("Last used pin").tag("")
                    ForEach(model.pins) { pin in
                        Text("\(pin.icon)  \(pin.title)").tag(pin.id)
                    }
                }
                .labelsHidden()
                .frame(maxWidth: 190)
            }

            field {
                TextField("Note", text: $model.text, axis: .vertical)
                    .lineLimit(2...4)
            }
            field {
                TextField("URL (optional)", text: $model.url)
                    .foregroundStyle(Self.accent)
            }

            if model.pins.isEmpty {
                Text("Open Brink once so your pins show up here.")
                    .font(.caption).foregroundStyle(.white.opacity(0.5))
            }
            if let error = model.error {
                Text(error).font(.caption).foregroundStyle(.red)
            }

            Spacer(minLength: 0)
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                    .keyboardShortcut(.cancelAction)
                    .buttonStyle(.plain)
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 10)
                Button(action: onSave) {
                    Text("Save")
                        .font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 16).padding(.vertical, 6)
                        .background(Capsule().fill(model.canSave ? Self.accent : Self.accent.opacity(0.35)))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)
                .disabled(!model.canSave)
            }
        }
        .padding(16)
        .frame(width: 380, height: 250)
        .foregroundStyle(.white)
        .background(Color.black)
        .environment(\.colorScheme, .dark)
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .textFieldStyle(.plain)
            .font(.system(size: 13))
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.white.opacity(0.12)))
    }
}
