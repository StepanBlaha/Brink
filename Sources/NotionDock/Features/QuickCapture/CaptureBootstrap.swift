import Foundation

/// Single entry point AppDelegate calls once at launch to start the capture features.
@MainActor
enum CaptureBootstrap {
    private static var quickCapture: QuickCaptureController?
    private static var clipboard: ClipboardAppendController?

    static func start(appModel: AppModel) {
        guard quickCapture == nil else { return }
        quickCapture = QuickCaptureController(appModel: appModel)
        clipboard = ClipboardAppendController(appModel: appModel)
    }
}
