import SwiftUI

/// The bundled legal texts (`legal/*.md`, copied into the app's Resources).
enum LegalDocument: String, CaseIterable, Identifiable {
    case privacy = "PRIVACY"
    case terms = "TERMS"
    case notice = "NOTICE"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .privacy: return "Privacy Policy"
        case .terms: return "Terms of Use"
        case .notice: return "Acknowledgements"
        }
    }

    var text: String {
        guard let url = Bundle.main.url(forResource: rawValue, withExtension: "md"),
              let text = try? String(contentsOf: url, encoding: .utf8) else {
            return "This document is missing from the app. Reinstall Brink to restore it."
        }
        return text
    }
}

/// Just enough Markdown for our legal files: headings, bullets, numbered lines, tables, inline styles.
struct LegalBlock: Identifiable {
    enum Kind { case heading(Int), body, bullet }
    let id: Int
    let kind: Kind
    let text: AttributedString

    static func parse(_ markdown: String) -> [LegalBlock] {
        var blocks: [LegalBlock] = []
        func inline(_ s: String) -> AttributedString {
            (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
        }
        for raw in markdown.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("|") {
                let cells = line.split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }
                if cells.allSatisfy({ $0.allSatisfy { "-: ".contains($0) } }) { continue }
                blocks.append(LegalBlock(id: blocks.count, kind: .bullet, text: inline(cells.joined(separator: " — "))))
            } else if line.hasPrefix("#") {
                let level = line.prefix { $0 == "#" }.count
                blocks.append(LegalBlock(id: blocks.count, kind: .heading(level), text: inline(String(line.drop { $0 == "#" || $0 == " " }))))
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
                blocks.append(LegalBlock(id: blocks.count, kind: .bullet, text: inline(String(line.dropFirst(2)))))
            } else {
                blocks.append(LegalBlock(id: blocks.count, kind: .body, text: inline(line)))
            }
        }
        return blocks
    }
}

struct LegalView: View {
    let document: LegalDocument
    var onDone: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(LegalBlock.parse(document.text)) { block in row(block) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            if let onDone {
                Divider().overlay(Theme.Color.divider)
                HStack {
                    Spacer()
                    Button("Done", action: onDone)
                        .buttonStyle(.notion)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Theme.Color.hover, in: RoundedRectangle(cornerRadius: Theme.Metrics.radius))
                        .keyboardShortcut(.defaultAction)
                }
                .padding(12)
            }
        }
        .frame(width: 480, height: 420)
        .background(Theme.Color.background)
        .foregroundStyle(Theme.Color.text)
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func row(_ block: LegalBlock) -> some View {
        switch block.kind {
        case .heading(let level):
            Text(block.text).font(level == 1 ? .system(size: 19, weight: .semibold) : Theme.Font.title)
                .padding(.top, level == 1 ? 0 : 6)
        case .body:
            Text(block.text).font(Theme.Font.body).fixedSize(horizontal: false, vertical: true)
        case .bullet:
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(Theme.Color.secondaryText)
                Text(block.text).fixedSize(horizontal: false, vertical: true)
            }
            .font(Theme.Font.body)
        }
    }
}
