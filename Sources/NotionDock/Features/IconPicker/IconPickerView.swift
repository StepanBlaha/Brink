import SwiftUI
import NotionKit

/// Right-click a strip icon → "Change Icon…" opens this inside the expanded notch (same
/// add-flow hosting `PinSearchView`/`DatabaseSetupView` use). Tabs: Emoji / Symbol / Letter.
/// Picking an icon applies immediately; "Reset to Notion icon" clears the override.
struct IconPickerView: View {
    let pin: Pin
    let client: NotionClient
    let onSave: (Pin) -> Void
    let onClose: () -> Void

    private enum Tab: String, CaseIterable, Identifiable {
        case emoji = "Emoji"
        case symbol = "Symbol"
        case letter = "Letter"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .emoji
    @State private var emojiQuery = ""
    @State private var swatch: AccentPreset = .blue
    @State private var letterText: String = ""
    @State private var alsoSetNotionIcon = false
    @State private var isSettingNotionIcon = false
    @State private var notionIconError: String?
    @State private var paletteCoordinator = PaletteCaptureCoordinator()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.Color.divider)
            Picker("", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(10)

            Group {
                switch tab {
                case .emoji: emojiTab
                case .symbol: symbolTab
                case .letter: letterTab
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            Divider().overlay(Theme.Color.divider)
            footer
        }
        .frame(width: 340, height: 440)
        .background(Theme.Color.background)
    }

    // MARK: - Header / footer

    private var header: some View {
        HStack(spacing: 8) {
            Text("Change Icon")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(Theme.Color.secondaryText)
            }
            .buttonStyle(.notion)
            .focusEffectDisabled()
        }
        .padding(12)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let notionIconError {
                Text(notionIconError)
                    .font(Theme.Font.caption)
                    .foregroundStyle(Theme.Color.danger)
            }
            Button("Reset to Notion icon") {
                var updated = pin
                updated.customIcon = nil
                onSave(updated)
            }
            .buttonStyle(.notion)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.secondaryText)
            .disabled(pin.customIcon == nil)
        }
        .padding(12)
    }

    // MARK: - Emoji tab

    private var emojiTab: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.secondaryText)
                TextField("Search emoji…", text: $emojiQuery)
                    .textFieldStyle(.plain)
                    .font(Theme.Font.small)
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
            .background(Theme.Color.hover, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            .padding(.horizontal, 12)

            if pin.kind == .page {
                Toggle("Also set as page icon in Notion", isOn: $alsoSetNotionIcon)
                    .font(Theme.Font.caption)
                    .foregroundStyle(Theme.Color.secondaryText)
                    .toggleStyle(.checkbox)
                    .padding(.horizontal, 12)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(EmojiCatalog.filtered(query: emojiQuery), id: \.title) { group in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(group.title)
                                .font(Theme.Font.caption)
                                .foregroundStyle(Theme.Color.secondaryText)
                            emojiGrid(group.entries)
                        }
                    }
                }
                .padding(.horizontal, 12)
            }

            Button("Open system emoji picker…") {
                paletteCoordinator.focusAndOpenPalette()
            }
            .buttonStyle(.notion)
            .font(Theme.Font.small)
            .foregroundStyle(Theme.Color.text)
            .padding(.bottom, 4)

            // 1x1 hidden field that captures whatever the system palette inserts.
            CharacterPaletteCapture(coordinator: paletteCoordinator) { inserted in
                applyEmoji(String(inserted.prefix(4)))
            }
            .frame(width: 1, height: 1)
            .opacity(0.01)
        }
    }

    private func emojiGrid(_ entries: [EmojiCatalog.Entry]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 4) {
            ForEach(entries, id: \.emoji) { entry in
                Button {
                    applyEmoji(entry.emoji)
                } label: {
                    Text(entry.emoji)
                        .font(.system(size: 18))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.notion)
                .focusEffectDisabled()
                .notionHover()
            }
        }
    }

    private func applyEmoji(_ emoji: String) {
        guard !emoji.isEmpty else { return }
        var updated = pin
        updated.customIcon = .emoji(emoji)
        onSave(updated)

        if alsoSetNotionIcon, pin.kind == .page {
            isSettingNotionIcon = true
            notionIconError = nil
            let pageId = pin.notionId
            Task {
                do {
                    _ = try await client.setPageEmojiIcon(pageId: pageId, emoji: emoji)
                } catch {
                    notionIconError = "Couldn't update the Notion page icon. Share the page with your integration in Notion."
                }
                isSettingNotionIcon = false
            }
        }
    }

    // MARK: - Symbol tab

    private var symbolTab: some View {
        VStack(spacing: 10) {
            ColorSwatchPicker(selection: $swatch)
                .padding(.top, 12)

            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                    ForEach(SymbolCatalog.names, id: \.self) { name in
                        Button {
                            var updated = pin
                            updated.customIcon = .sfSymbol(name: name, colorHex: swatch.resolvedHex)
                            onSave(updated)
                        } label: {
                            Image(systemName: name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(swatch.color)
                                .frame(width: 32, height: 32)
                        }
                        .buttonStyle(.notion)
                        .focusEffectDisabled()
                        .notionHover()
                    }
                }
                .padding(.horizontal, 12)
            }
        }
    }

    // MARK: - Letter tab

    private var letterTab: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 8)

            Text(letterText.isEmpty ? "A" : letterText)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(swatch.color, in: Circle())

            TextField("1–2 letters", text: $letterText)
                .textFieldStyle(.roundedBorder)
                .font(Theme.Font.body)
                .multilineTextAlignment(.center)
                .frame(width: 120)
                .onChange(of: letterText) { _, newValue in
                    let trimmed = String(newValue.uppercased().prefix(2))
                    if trimmed != letterText { letterText = trimmed }
                }

            ColorSwatchPicker(selection: $swatch)

            Button("Use") {
                let text = letterText.isEmpty ? String(pin.title.prefix(1)).uppercased() : letterText
                var updated = pin
                updated.customIcon = .letter(text: text, colorHex: swatch.resolvedHex)
                onSave(updated)
            }
            .buttonStyle(.notion)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(Theme.Color.accent)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))

            Spacer()
        }
    }
}

/// A row of tappable color swatches drawn from the accent presets (excluding "System", since a
/// custom icon needs a fixed, storable hex rather than a color that tracks live).
struct ColorSwatchPicker: View {
    @Binding var selection: AccentPreset

    var body: some View {
        HStack(spacing: 8) {
            ForEach(AccentPreset.allCases.filter { $0 != .system }) { preset in
                Circle()
                    .fill(preset.color)
                    .frame(width: 18, height: 18)
                    .overlay(
                        Circle().stroke(Theme.Color.text, lineWidth: selection == preset ? 2 : 0)
                    )
                    .contentShape(Circle())
                    .onTapGesture { selection = preset }
                    .help(preset.displayName)
            }
        }
    }
}
