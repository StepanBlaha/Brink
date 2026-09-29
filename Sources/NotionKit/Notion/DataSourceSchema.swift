import Foundation

public struct SelectOption: Sendable, Equatable, Identifiable, Codable {
    public let id: String
    public let name: String
    public let color: String

    public init(id: String, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }
}

public struct StatusGroup: Sendable, Equatable, Codable {
    public let name: String
    public let optionIds: [String]

    public init(name: String, optionIds: [String]) {
        self.name = name
        self.optionIds = optionIds
    }
}

public struct PropertySchema: Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let type: String
    public let selectOptions: [SelectOption]?
    public let statusOptions: [SelectOption]?
    public let statusGroups: [StatusGroup]?

    public init(id: String, name: String, type: String, selectOptions: [SelectOption]? = nil, statusOptions: [SelectOption]? = nil, statusGroups: [StatusGroup]? = nil) {
        self.id = id
        self.name = name
        self.type = type
        self.selectOptions = selectOptions
        self.statusOptions = statusOptions
        self.statusGroups = statusGroups
    }
}

extension PropertySchema {
    /// The status option names that belong to the "Complete" group (matched case-insensitively),
    /// or, if no groups are present, whose name itself reads as "done"/"completed"/"hotovo".
    public var doneStatusOptionNames: [String] {
        let doneWords: Set<String> = ["done", "completed", "hotovo", "complete"]
        if let statusGroups, !statusGroups.isEmpty {
            let completeGroups = statusGroups.filter { doneWords.contains($0.name.lowercased()) }
            let idsInCompleteGroups = Set(completeGroups.flatMap(\.optionIds))
            if !idsInCompleteGroups.isEmpty {
                return (statusOptions ?? []).filter { idsInCompleteGroups.contains($0.id) }.map(\.name)
            }
        }
        return (statusOptions ?? []).filter { doneWords.contains($0.name.lowercased()) }.map(\.name)
    }
}

public struct DataSourceSchema: Sendable, Equatable {
    public let id: String
    public let name: String
    public let properties: [PropertySchema]

    public init(id: String, name: String, properties: [PropertySchema]) {
        self.id = id
        self.name = name
        self.properties = properties
    }
}

extension DataSourceSchema: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, name, title, properties
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let name = try container.decodeIfPresent(String.self, forKey: .name) {
            self.name = name
        } else {
            let items = try container.decodeIfPresent([RichTextItem].self, forKey: .title) ?? []
            self.name = RichText.plainText(from: items)
        }
        let raw = try container.decodeIfPresent([String: PropertySchemaBox].self, forKey: .properties) ?? [:]
        properties = raw.map { name, box in
            PropertySchema(id: box.id, name: name, type: box.type, selectOptions: box.select?.options, statusOptions: box.status?.options, statusGroups: box.status?.groups)
        }.sorted { $0.name < $1.name }
    }
}

private struct PropertySchemaBox: Decodable {
    let id: String
    let type: String
    let select: OptionsBox?
    let status: StatusOptionsBox?

    struct OptionsBox: Decodable {
        let options: [SelectOption]
    }

    struct StatusOptionsBox: Decodable {
        let options: [SelectOption]
        let groups: [StatusGroup]?

        private enum CodingKeys: String, CodingKey { case options, groups }
        private struct GroupBox: Decodable {
            let name: String
            let optionIds: [String]
            enum CodingKeys: String, CodingKey { case name, optionIds = "option_ids" }
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            options = try container.decode([SelectOption].self, forKey: .options)
            let boxes = try container.decodeIfPresent([GroupBox].self, forKey: .groups) ?? []
            groups = boxes.isEmpty ? nil : boxes.map { StatusGroup(name: $0.name, optionIds: $0.optionIds) }
        }
    }
}
