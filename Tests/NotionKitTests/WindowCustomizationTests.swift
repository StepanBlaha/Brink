import Testing
import Foundation
import CoreGraphics
@testable import NotionKit

@Suite("Window customization")
struct WindowCustomizationTests {
    private func freshDefaults() -> UserDefaults {
        let name = "test-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    @Test func clampsPanelSize() {
        let tiny = PanelSizeLimits.clamp(CGSize(width: 10, height: 10), maxHeight: 800)
        #expect(tiny == CGSize(width: 300, height: 240))
        let huge = PanelSizeLimits.clamp(CGSize(width: 5000, height: 5000), maxHeight: 800)
        #expect(huge == CGSize(width: 900, height: 800))
        let narrowScreen = PanelSizeLimits.clamp(CGSize(width: 800, height: 400), maxWidth: 600, maxHeight: 800)
        #expect(narrowScreen.width == 600)
        // Minimums win over an absurdly small screen.
        #expect(PanelSizeLimits.clamp(CGSize(width: 500, height: 500), maxWidth: 100, maxHeight: 100) == CGSize(width: 300, height: 240))
    }

    @Test func persistsPerPinAndResets() {
        let store = PanelSizeStore(defaults: freshDefaults())
        #expect(store.size(for: "a", maxHeight: 800) == nil)
        store.set(CGSize(width: 700, height: 500), for: "a", maxHeight: 800)
        store.set(CGSize(width: 320, height: 260), for: "b", maxHeight: 800)
        #expect(store.size(for: "a", maxHeight: 800) == CGSize(width: 700, height: 500))
        #expect(store.size(for: "b", maxHeight: 800) == CGSize(width: 320, height: 260))
        // Stored size is re-clamped when the screen shrinks.
        #expect(store.size(for: "a", maxHeight: 400)?.height == 400)
        // Writes clamp too.
        #expect(store.set(CGSize(width: 9999, height: 1), for: "c", maxHeight: 800) == CGSize(width: 900, height: 240))
        store.reset(pinID: "a")
        #expect(store.size(for: "a", maxHeight: 800) == nil)
        #expect(store.size(for: "b", maxHeight: 800) != nil)
    }

    @Test func migratesRestingPillHidden() {
        #expect(PillStyle.resolve(stored: nil, legacyHidden: true) == .hidden)
        #expect(PillStyle.resolve(stored: nil, legacyHidden: false) == .line)
        #expect(PillStyle.resolve(stored: nil, legacyHidden: nil) == .line)
        #expect(PillStyle.resolve(stored: "dot", legacyHidden: true) == .dot)
        #expect(PillStyle.resolve(stored: "bogus", legacyHidden: true) == .hidden)
    }

    @Test func pillLabels() {
        #expect(PillLabel.text(done: 7, total: 12, asFraction: true) == "7/12")
        #expect(PillLabel.text(done: 7, total: 12, asFraction: false) == "58%")
        #expect(PillLabel.text(done: 0, total: 0, asFraction: false) == "0%")
    }

    @Test func topEdgeRects() {
        let win = CGSize(width: 1000, height: 500)
        let body = NotchGeometry.bodyRect(edge: .top, windowSize: win, depth: 40, length: 200, center: 500)
        #expect(body == CGRect(x: 400, y: 0, width: 200, height: 40))
        let bounds = NotchGeometry.boundingRect(edge: .top, windowSize: win, depth: 40, length: 200, flare: 10, center: 500)
        #expect(bounds == CGRect(x: 390, y: 0, width: 220, height: 40))
        let right = NotchGeometry.bodyRect(edge: .right, windowSize: win, depth: 40, length: 200, center: 250)
        #expect(right == CGRect(x: 960, y: 150, width: 40, height: 200))
        let left = NotchGeometry.boundingRect(edge: .left, windowSize: win, depth: 40, length: 200, flare: 10, center: 250)
        #expect(left == CGRect(x: 0, y: 140, width: 40, height: 220))
        #expect(NotchGeometry.center(anchor: 100, leading: true, length: 80) == 140)
        #expect(NotchGeometry.center(anchor: 100, leading: false, length: 80) == 100)
    }

    @Test func topWindowFrame() {
        let frame = CGRect(x: 0, y: 0, width: 1500, height: 900)
        let visible = CGRect(x: 0, y: 30, width: 1500, height: 840)
        let size = CGSize(width: 1000, height: 500)
        let centered = NotchGeometry.windowFrame(edge: .top, frame: frame, visible: visible, size: size, topAnchorX: 750, topLeading: false)
        #expect(centered == CGRect(x: 250, y: 400, width: 1000, height: 500))
        // Anchored near the right edge: window is clamped inside the screen.
        let clamped = NotchGeometry.windowFrame(edge: .top, frame: frame, visible: visible, size: size, topAnchorX: 1400, topLeading: true)
        #expect(clamped.maxX == 1500 && clamped.maxY == 900)
        let side = NotchGeometry.windowFrame(edge: .right, frame: frame, visible: visible, size: CGSize(width: 400, height: 640), topAnchorX: 0, topLeading: false)
        #expect(side == CGRect(x: 1100, y: 130, width: 400, height: 640))
    }

    @Test func displayPreference() {
        let screens = [ScreenInfo(name: "Built-in", frame: CGRect(x: 0, y: 0, width: 1500, height: 900)),
                       ScreenInfo(name: "LG", frame: CGRect(x: 1500, y: 0, width: 2560, height: 1440)),
                       ScreenInfo(name: "LG", frame: CGRect(x: 4060, y: 0, width: 2560, height: 1440))]
        #expect(DisplayPreference.main.resolve(screens: screens, mouse: CGPoint(x: 2000, y: 5)) == 0)
        #expect(DisplayPreference.mouse.resolve(screens: screens, mouse: CGPoint(x: 2000, y: 5)) == 1)
        #expect(DisplayPreference.mouse.resolve(screens: screens, mouse: CGPoint(x: -5000, y: 5)) == 0)
        let named = DisplayPreference.named(name: "LG", frame: screens[2].frame)
        #expect(named.resolve(screens: screens, mouse: .zero) == 2)
        #expect(DisplayPreference.named(name: "LG", frame: .zero).resolve(screens: screens, mouse: .zero) == 1)
        #expect(DisplayPreference.named(name: "Gone", frame: screens[1].frame).resolve(screens: screens, mouse: .zero) == 1)
        #expect(DisplayPreference.named(name: "Gone", frame: .zero).resolve(screens: screens, mouse: .zero) == 0)
        #expect(DisplayPreference(stored: named.stored) == named)
        #expect(DisplayPreference(stored: "mouse") == .mouse)
        #expect(DisplayPreference(stored: nil) == .main)
    }
}
