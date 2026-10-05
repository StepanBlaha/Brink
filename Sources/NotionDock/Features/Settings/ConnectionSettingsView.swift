import SwiftUI
import NotionKit

/// Settings → Connection: "Connect to Notion" (OAuth, when configured) with the internal
/// integration token as the "Advanced" fallback, plus workspace info and Disconnect.
struct ConnectionSettingsView: View {
    let appModel: AppModel

    @State private var tokenInput = ""
    @State private var showTokenEntry = false

    private var tokenFieldVisible: Bool {
        !appModel.oauthAvailable || showTokenEntry || appModel.authKind == .internal
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connect to Notion")
                .font(Theme.Font.title)
                .foregroundStyle(Theme.Color.text)

            if appModel.authKind == .oauth {
                connectedCard
            } else if appModel.oauthAvailable {
                oauthIntro
            }

            if tokenFieldVisible { tokenEntry }

            actions
            ConnectionStatusText(status: appModel.connectionStatus)

            Divider()
            footnotes
            Divider()
            NotesConnectionSection(appModel: appModel)
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: OAuth

    private var oauthIntro: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(appModel.isSigningIn ? "Waiting for Notion…" : "Connect to Notion") {
                Task { await appModel.connectWithNotion() }
            }
            .buttonStyle(.notion)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Theme.Color.accent, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            .foregroundStyle(.white)
            .disabled(appModel.isSigningIn)

            Text("Your browser opens Notion. Pick the pages and databases Brink may access, then click Allow. You can change the selection later by connecting again.")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            if !showTokenEntry && appModel.authKind == nil {
                Button("Use an integration token instead") { showTokenEntry = true }
                    .buttonStyle(.link)
                    .font(Theme.Font.small)
            }
        }
    }

    private var connectedCard: some View {
        HStack(spacing: 10) {
            WorkspaceIconView(icon: appModel.workspace?.workspaceIcon, name: appModel.workspace?.workspaceName)
            VStack(alignment: .leading, spacing: 2) {
                Text(appModel.workspace?.workspaceName ?? "Notion workspace")
                    .font(Theme.Font.body).foregroundStyle(Theme.Color.text)
                Text("Connected with Notion")
                    .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
            }
            Spacer()
            Button("Choose pages…") { Task { await appModel.connectWithNotion() } }
                .buttonStyle(.link)
                .font(Theme.Font.small)
                .disabled(appModel.isSigningIn)
                .help("Opens Notion's page picker again to change what Brink can access.")
        }
        .padding(10)
        .background(Theme.Color.hover.opacity(0.5), in: RoundedRectangle(cornerRadius: Theme.Metrics.panelRadius))
    }

    // MARK: Token (Advanced)

    private var tokenEntry: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(appModel.oauthAvailable ? "Advanced: internal integration token" : "Internal integration token")
                .font(Theme.Font.small)
                .foregroundStyle(Theme.Color.secondaryText)
            HStack(spacing: 8) {
                SecureField(appModel.authKind == .internal ? "Token saved" : "secret_…", text: $tokenInput)
                    .textFieldStyle(.roundedBorder)
                Button("Save") {
                    appModel.saveToken(tokenInput)
                    tokenInput = ""
                }
                .buttonStyle(.notion)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.Color.accent.opacity(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty ? 0.4 : 1))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                .disabled(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button("Test connection") {
                Task { await appModel.testConnection() }
            }
            .buttonStyle(.notion)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Theme.Color.hover)
            .foregroundStyle(Theme.Color.text)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            .disabled(!appModel.hasToken)

            Button("Disconnect") {
                appModel.disconnect()
                showTokenEntry = false
            }
            .buttonStyle(.notion)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Theme.Color.hover)
            .foregroundStyle(Theme.Color.danger)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            .disabled(!appModel.hasToken)
            .help("Removes Brink's Notion credentials from this Mac's Keychain.")
        }
    }

    @ViewBuilder
    private var footnotes: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch appModel.authKind {
            case .oauth:
                Text("Brink sees only the pages you picked in Notion. To revoke access entirely, remove Brink under Notion → Settings → Connections.")
                    .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            case .internal, nil:
                if tokenFieldVisible {
                    Text(appModel.hasToken ? "Token saved." : "No token yet. Paste one above.")
                        .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                    Link("Create an integration at notion.so/profile/integrations", destination: Links.notionIntegrations)
                        .font(Theme.Font.small)
                    Text("Share each page with your integration in Notion: page ••• → Connections.")
                        .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// Shared status line for Settings and onboarding.
struct ConnectionStatusText: View {
    let status: AppModel.ConnectionStatus
    var centered = false

    var body: some View {
        switch status {
        case .idle:
            EmptyView()
        case .testing:
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Checking…").font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
            }
        case .connected(let count):
            Text("Connected. Brink can see \(count) item\(count == 1 ? "" : "s").")
                .font(Theme.Font.small).foregroundStyle(Theme.Color.success)
                .multilineTextAlignment(centered ? .center : .leading)
        case .error(let message):
            Text(message)
                .font(Theme.Font.small).foregroundStyle(Theme.Color.danger)
                .multilineTextAlignment(centered ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Notion's `workspace_icon` is an image URL, an emoji, or absent.
struct WorkspaceIconView: View {
    let icon: String?
    let name: String?
    var size: CGFloat = 32

    var body: some View {
        Group {
            if let icon, let url = URL(string: icon), url.scheme?.hasPrefix("http") == true {
                AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { initial }
            } else if let icon, !icon.isEmpty {
                Text(icon).font(.system(size: size * 0.6))
            } else {
                initial
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityHidden(true)
    }

    private var initial: some View {
        Text(String((name ?? "N").prefix(1)).uppercased())
            .font(.system(size: size * 0.5, weight: .semibold))
            .frame(width: size, height: size)
            .background(Theme.Color.hover)
    }
}
