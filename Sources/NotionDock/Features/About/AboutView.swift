import SwiftUI
import AppKit
import NotionKit

struct AboutView: View {
    @State private var showingNotice = false
    private let version = AppVersion.current()

    var body: some View {
        VStack(spacing: 6) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable().frame(width: 96, height: 96)
                .accessibilityLabel("Brink app icon")
                .padding(.top, 24)
            Text("Brink").font(.system(size: 24, weight: .semibold))
            Text("Your pages, on the edge.").font(Theme.Font.body).foregroundStyle(Theme.Color.secondaryText)
            Text("Version \(version.marketing) (\(version.build))")
                .font(Theme.Font.small).foregroundStyle(Theme.Color.tertiaryText).padding(.top, 4)

            HStack(spacing: 8) {
                pill("Website") { NSWorkspace.shared.open(Links.website) }
                pill("Privacy") { AppWindows.shared.showLegal(.privacy) }
                pill("Terms") { AppWindows.shared.showLegal(.terms) }
            }
            .padding(.top, 14)
            pill("Acknowledgements") { showingNotice = true }.padding(.top, 4)

            Spacer(minLength: 8)
            Text("© 2026 Stepan Blaha").font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
            Text("Brink is an independent app and is not affiliated with Notion Labs, Inc.")
                .font(Theme.Font.caption).foregroundStyle(Theme.Color.tertiaryText)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 28).padding(.bottom, 20)
        }
        .frame(width: 340, height: 420)
        .foregroundStyle(Theme.Color.text)
        .background(Theme.Color.background)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showingNotice) {
            LegalView(document: .notice) { showingNotice = false }
        }
    }

    private func pill(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.notion)
            .font(Theme.Font.small)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Theme.Color.hover, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
    }
}
