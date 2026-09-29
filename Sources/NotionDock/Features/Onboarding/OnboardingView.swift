import SwiftUI
import AppKit

extension Notification.Name {
    /// Ask the app delegate to show the welcome window (Settings → General → "Show welcome again").
    static let showWelcomeRequested = Notification.Name("NotionDock.showWelcomeRequested")
}

enum Onboarding {
    static let completedKey = "onboardingCompleted"

    static var isCompleted: Bool {
        get { UserDefaults.standard.bool(forKey: completedKey) }
        set { UserDefaults.standard.set(newValue, forKey: completedKey) }
    }

    /// First launch, or nothing to show yet (no token and no pins).
    @MainActor static func shouldShow(_ appModel: AppModel) -> Bool {
        !isCompleted || (!appModel.hasToken && appModel.pinStore.pins.isEmpty)
    }
}

struct OnboardingView: View {
    let appModel: AppModel
    var onFinish: (_ openAddFlow: Bool) -> Void

    @State private var step = 0
    @State private var goingForward = true
    @State private var tokenInput = ""

    private let stepCount = 3

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                switch step {
                case 0: welcome.transition(slide)
                case 1: connect.transition(slide)
                default: pinFirst.transition(slide)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()

            footer
        }
        .frame(width: 460, height: 440)
        .foregroundStyle(Theme.Color.text)
        .background(Theme.Color.background)
        .preferredColorScheme(.dark)
    }

    private var slide: AnyTransition {
        guard !Theme.Motion.reduceMotion else { return .opacity }
        let edge: Edge = goingForward ? .trailing : .leading
        let out: Edge = goingForward ? .leading : .trailing
        return .asymmetric(insertion: .move(edge: edge).combined(with: .opacity),
                           removal: .move(edge: out).combined(with: .opacity))
    }

    // MARK: Steps

    private var welcome: some View {
        VStack(spacing: 8) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 110, height: 110)
                .accessibilityLabel("Brink app icon")
            Text("Brink").font(.system(size: 28, weight: .semibold)).padding(.top, 6)
            Text("Your pages, on the edge.").font(Theme.Font.body).foregroundStyle(Theme.Color.secondaryText)
            Text("Pin the Notion pages and databases you use most, and check things off with one hover.")
                .font(Theme.Font.small).foregroundStyle(Theme.Color.tertiaryText)
                .multilineTextAlignment(.center).padding(.top, 10).padding(.horizontal, 50)
        }
    }

    private var connect: some View {
        VStack(spacing: 12) {
            Text("Connect to Notion").font(.system(size: 22, weight: .semibold))
            Text("Create an integration in Notion and paste its token below.\nThen share each page you want to pin with that integration (••• → Connections).")
                .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            pill("Open Notion integrations") { NSWorkspace.shared.open(Links.notionIntegrations) }
            SecureField(appModel.hasToken ? "Token saved" : "secret_…", text: $tokenInput)
                .textFieldStyle(.roundedBorder).frame(width: 300)
                .onSubmit(testConnection)
            HStack(spacing: 8) {
                pill("Test connection", action: testConnection)
                    .disabled(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty && !appModel.hasToken)
            }
            status.frame(height: 32)
        }
        .padding(.horizontal, 40)
    }

    private var pinFirst: some View {
        VStack(spacing: 10) {
            Image(systemName: "plus.rectangle.on.rectangle")
                .font(.system(size: 40, weight: .light)).foregroundStyle(Theme.Color.accent)
            Text("Pin your first page").font(.system(size: 22, weight: .semibold)).padding(.top, 6)
            Text("Brink lives on the edge of your screen. Hover it, tap +, and pick a page or database.")
                .font(Theme.Font.small).foregroundStyle(Theme.Color.secondaryText)
                .multilineTextAlignment(.center).padding(.horizontal, 50)
        }
    }

    @ViewBuilder
    private var status: some View {
        switch appModel.connectionStatus {
        case .idle: if appModel.hasToken { small("Token saved.", Theme.Color.secondaryText) }
        case .testing: ProgressView().controlSize(.small)
        case .connected(let count): small("Connected. Brink can see \(count) page\(count == 1 ? "" : "s").", Theme.Color.success)
        case .error(let message): small(message, Theme.Color.danger)
        }
    }

    private func small(_ text: String, _ color: Color) -> some View {
        Text(text).font(Theme.Font.small).foregroundStyle(color).multilineTextAlignment(.center)
    }

    // MARK: Footer

    private var footer: some View {
        // Dots are centered on their own layer so the Back button appearing and the
        // primary label changing width never push them sideways.
        ZStack {
            HStack {
                if step > 0 {
                    pill("Back") { go(step - 1) }
                        .transition(.opacity)
                }
                Spacer()
                switch step {
                case 0: primary("Get started") { go(1) }
                case 1: primary(appModel.hasToken ? "Continue" : "Skip for now") { go(2) }
                default: primary("Add a page") { onFinish(true) }
                }
            }
            stepDots
        }
        .padding(.horizontal, 20).padding(.vertical, 14)
    }

    private var stepDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<stepCount, id: \.self) { i in
                Capsule()
                    .fill(i == step ? Theme.Color.text : Theme.Color.tertiaryText)
                    .frame(width: i == step ? 16 : 6, height: 6)
            }
        }
        .animation(Theme.Motion.contents, value: step)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(step + 1) of \(stepCount)")
    }

    private func go(_ next: Int) {
        goingForward = next > step
        withAnimation(Theme.Motion.contents) { step = next }
    }

    private func testConnection() {
        if !tokenInput.trimmingCharacters(in: .whitespaces).isEmpty {
            appModel.saveToken(tokenInput)
            tokenInput = ""
        }
        guard appModel.hasToken else { return }
        Task { await appModel.testConnection() }
    }

    private func primary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.notion)
            .padding(.horizontal, 14).padding(.vertical, 7)
            .background(Theme.Color.accent, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
            .foregroundStyle(.white)
            .keyboardShortcut(.defaultAction)
    }

    private func pill(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.notion)
            .font(Theme.Font.small)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Theme.Color.hover, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
    }
}
