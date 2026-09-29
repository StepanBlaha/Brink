import AppKit
import SwiftUI
import NotionKit

/// Design tokens: Notion-style content on a Codenotch-style black notch.
enum Theme {
    /// Codenotch-style surface: pure black notch that reads as part of the bezel,
    /// so the palette is always dark regardless of system appearance.
    enum Color {
        static let notch = SwiftUI.Color.black
        static let background = SwiftUI.Color.black
        static let sidebar = SwiftUI.Color(hex: 0x1C1C1E)
        static let text = SwiftUI.Color.white
        static let secondaryText = SwiftUI.Color(hex: 0x808080)
        static let tertiaryText = SwiftUI.Color.white.opacity(0.32)
        static let hover = SwiftUI.Color.white.opacity(0.16)
        static let selected = SwiftUI.Color.white.opacity(0.22)
        static let divider = SwiftUI.Color.white.opacity(0.1)
        /// Resolved from `Settings.shared.accentPreset`. Computed (not stored) so every view
        /// that reads it inside its `body` is tracked by Observation and updates live.
        static var accent: SwiftUI.Color { Settings.shared.accentColor }
        static let checkboxBorder = SwiftUI.Color.white.opacity(0.4)
        static let danger = SwiftUI.Color(hex: 0xFF453A)
        static let success = SwiftUI.Color(hex: 0x00FF88)
    }

    enum Font {
        /// Base sizes scaled live by `Settings.shared.size`.
        private static var scale: CGFloat { Settings.shared.size.fontScale }

        static var title: SwiftUI.Font { .system(size: 15 * scale, weight: .semibold) }
        static var body: SwiftUI.Font { .system(size: 14 * scale) }
        static var small: SwiftUI.Font { .system(size: 12 * scale) }
        static var caption: SwiftUI.Font { .system(size: 11 * scale, weight: .medium) }
    }

    enum Metrics {
        static let radius: CGFloat = 4
        static let panelRadius: CGFloat = 8
        static let rowHeight: CGFloat = 30
        static let hPadding: CGFloat = 12
    }

    /// Spring/timing curves for the notch's liquid unfold. Honors "reduce motion".
    enum Motion {
        static var reduceMotion: Bool {
            NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        }

        /// Shape morph between resting / strip / expanded.
        static var unfold: SwiftUI.Animation {
            reduceMotion ? .linear(duration: 0.001) : .spring(response: 0.62, dampingFraction: 0.72)
        }

        /// Icon/content appearance inside the unfolded notch.
        static var contents: SwiftUI.Animation {
            reduceMotion ? .linear(duration: 0.001) : .spring(response: 0.48, dampingFraction: 0.8)
        }

        /// Crossfade when switching which pin's content is shown while expanded.
        static var crossfade: SwiftUI.Animation {
            .easeInOut(duration: 0.16)
        }

        /// Content entering/leaving with a phase change, mirrored: it slides out of the
        /// screen edge as the shape unfolds, and back into it as the shape folds.
        static func phaseTransition(edge: DockEdge) -> AnyTransition {
            guard !reduceMotion else { return .opacity }
            let offset: CGSize
            switch edge {
            case .right: offset = CGSize(width: 14, height: 0)
            case .left: offset = CGSize(width: -14, height: 0)
            case .top: offset = CGSize(width: 0, height: -14)
            }
            return .asymmetric(
                insertion: .opacity.combined(with: .offset(offset)).animation(contents.delay(0.06)),
                removal: .opacity.combined(with: .offset(offset)).animation(contents)
            )
        }

        /// Rows being added/removed/reordered in page and task lists.
        static var list: SwiftUI.Animation {
            reduceMotion ? .linear(duration: 0.001) : .spring(response: 0.42, dampingFraction: 0.82)
        }

        /// Row insert/remove: fade + slight drop, mirroring the icon stagger.
        static var rowTransition: AnyTransition {
            reduceMotion ? .opacity : .opacity.combined(with: .offset(y: -6))
        }

        /// Per-index stagger delay for icons fading/sliding in, capped at 0.18s.
        static func stagger(_ index: Int) -> Double {
            reduceMotion ? 0 : min(Double(index) * 0.045, 0.18)
        }
    }

    /// Metrics for the Codenotch-style notch shape in its three states.
    enum Notch {
        struct Metrics: Equatable {
            var depth: CGFloat
            var length: CGFloat
            var corner: CGFloat
            var flare: CGFloat
        }

        /// Live scale factor from `Settings.shared.size` (0.85 / 1 / 1.2). All metrics below
        /// are computed vars (not stored constants) so they track this live and re-layout via
        /// `DockController.positionPanel` when the setting changes.
        private static var scale: CGFloat { Settings.shared.size.metricsScale }

        static var resting: Metrics { Metrics(depth: 8 * scale, length: 80 * scale, corner: 4 * scale, flare: 6 * scale) }

        static var iconSize: CGFloat { 28 * scale }
        static var iconSpacing: CGFloat { 8 * scale }
        static var stripPadding: CGFloat { 14 * scale }
        static var stripDepth: CGFloat { 56 * scale }
        static var stripCorner: CGFloat { 18 * scale }
        static var stripFlare: CGFloat { 14 * scale }

        /// Default expanded panel size in screen terms (width x height): a tall panel hanging
        /// from a side edge, a wide one hanging below the top edge.
        static func defaultExpandedSize(edge: DockEdge) -> CGSize {
            edge == .top ? CGSize(width: 560 * scale, height: 400 * scale) : CGSize(width: 400 * scale, height: 560 * scale)
        }
        static var expandedCorner: CGFloat { 22 * scale }
        static var expandedFlare: CGFloat { 20 * scale }

        /// Room the peek card needs below/next to the strip inside the window.
        static var peekRoom: CGFloat { 240 * scale }

        /// Extra radius around the shape's bounding rect used both for mouse pass-through
        /// and for the resting-pill hover trigger.
        static let hotZonePadding: CGFloat = 30

        static let hoverOutDelay: TimeInterval = 0.35

        /// `topInset` is the hardware-notch height when the top-edge shape is merged with it:
        /// the shape grows by that much so its content clears the bezel.
        static func stripMetrics(pinCount: Int, topInset: CGFloat = 0) -> Metrics {
            let icons = CGFloat(pinCount) * iconSize + CGFloat(max(pinCount - 1, 0)) * iconSpacing
            let addButton = iconSpacing + iconSize
            // Group switcher sits ahead of the icons (its own slot + spacing + divider gap).
            let groupSwitcher = iconSize + iconSpacing + 6 * scale
            let length = stripPadding * 2 + groupSwitcher + icons + addButton
            return Metrics(depth: stripDepth + topInset, length: length, corner: stripCorner, flare: stripFlare)
        }

        /// The expanded shape for a panel of `size` (screen terms), on `edge`.
        static func expandedMetrics(edge: DockEdge, size: CGSize, topInset: CGFloat = 0) -> Metrics {
            let sideways = edge != .top
            return Metrics(
                depth: (sideways ? size.width : size.height) + topInset,
                length: sideways ? size.height : size.width,
                corner: expandedCorner,
                flare: expandedFlare
            )
        }

        /// Resting pill for `style`: the line is the classic pill; the dot is a small circle
        /// (drawn separately); the percent pill is a slightly larger capsule holding text.
        static func restingMetrics(edge: DockEdge, style: PillStyle, topInset: CGFloat = 0, mergedWidth: CGFloat? = nil) -> Metrics {
            var m = resting
            if style == .percent {
                let top = edge == .top
                m.depth = (top ? 18 : 34) * scale
                m.length = (top ? 46 : 20) * scale
                m.corner = 9 * scale
            } else if style == .dot {
                m = Metrics(depth: 8, length: 8, corner: 4, flare: 0)
            }
            if let mergedWidth {
                // Lip hanging under the hardware notch, as wide as the notch itself.
                m.length = mergedWidth
                m.depth = topInset + (style == .hidden ? 0 : m.depth * 0.6)
            }
            return m
        }
    }
}

extension SwiftUI.Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(nsColor: NSColor(hex: hex, alpha: alpha))
    }
}

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

/// Notion-style hover background for rows and icon buttons.
struct HoverHighlight: ViewModifier {
    var isSelected = false
    @State private var isHovering = false

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: Theme.Metrics.radius)
                    .fill(isSelected ? Theme.Color.selected : (isHovering ? Theme.Color.hover : .clear))
            )
            .onHover { isHovering = $0 }
            .animation(.easeOut(duration: 0.12), value: isHovering)
    }
}

extension View {
    func notionHover(selected: Bool = false) -> some View {
        modifier(HoverHighlight(isSelected: selected))
    }
}

/// Default style for every clickable control: pointing-hand cursor, brighter on hover,
/// dimmed while pressed. Combine with `.notionHover()` where a hover background fits.
struct NotionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        NotionButtonBody(configuration: configuration)
    }

    private struct NotionButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @State private var isHovering = false

        var body: some View {
            configuration.label
                .brightness(isHovering ? 0.35 : 0)
                .opacity(configuration.isPressed ? 0.6 : 1)
                .contentShape(Rectangle())
                .onHover { hovering in
                    isHovering = hovering
                    if hovering { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
                .onDisappear {
                    if isHovering { NSCursor.pop() }
                }
                .animation(.easeOut(duration: 0.12), value: isHovering)
        }
    }
}

extension ButtonStyle where Self == NotionButtonStyle {
    static var notion: NotionButtonStyle { NotionButtonStyle() }
}

