import AppKit
import SwiftUI
import NotionKit

/// The page's Notion cover as a thin strip (aspect-fill, clipped) fading into the black notch.
/// Images come from `CoverCache` (disk, keyed by URL); an expired Notion file URL (403) is
/// re-fetched through `refresh`.
struct CoverStrip: View {
    let cover: FileRef
    let refresh: @Sendable () async -> URL?
    static let height: CGFloat = 56

    @State private var image: NSImage?
    @State private var loadedURL: URL?

    var body: some View {
        ZStack(alignment: .bottom) {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, minHeight: Self.height, maxHeight: Self.height)
                    .clipped()
                    .transition(.opacity)
            } else {
                Theme.Color.sidebar
            }
            LinearGradient(colors: [Color.black.opacity(0), Color.black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                .frame(height: Self.height * 0.55)
        }
        .frame(maxWidth: .infinity, minHeight: Self.height, maxHeight: Self.height)
        .clipped()
        .allowsHitTesting(false)
        .task(id: cover.url) {
            guard loadedURL != cover.url else { return }
            let data = await CoverCache.shared.imageData(for: cover.url, refresh: refresh)
            loadedURL = cover.url
            if let data, let loaded = NSImage(data: data) {
                withAnimation(.easeOut(duration: 0.2)) { image = loaded }
            }
        }
    }
}
