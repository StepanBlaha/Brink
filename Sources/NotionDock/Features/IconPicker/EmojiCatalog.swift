import Foundation

/// A curated, grouped set of ~200 common emoji for the icon picker's Emoji tab. Each entry
/// carries a lowercase keyword list so the search field can filter without needing a full
/// Unicode CLDR name database.
enum EmojiCatalog {
    struct Entry {
        let emoji: String
        let keywords: [String]
    }

    struct Group {
        let title: String
        let entries: [Entry]
    }

    static let groups: [Group] = [
        Group(title: "Smileys", entries: [
            e("😀", "grin", "happy", "smile"), e("😃", "smile", "happy"), e("😄", "smile", "laugh", "happy"),
            e("😁", "grin", "smile"), e("😆", "laugh", "lol"), e("😅", "sweat", "laugh"),
            e("🤣", "rofl", "laugh"), e("😂", "joy", "laugh", "tears"), e("🙂", "smile", "slight"),
            e("😉", "wink"), e("😊", "blush", "smile"), e("😍", "love", "heart", "eyes"),
            e("😘", "kiss"), e("😎", "cool", "sunglasses"), e("🤔", "think", "hmm"),
            e("😐", "neutral"), e("😴", "sleep", "tired"), e("😢", "cry", "sad"),
            e("😭", "cry", "sob", "sad"), e("😡", "angry", "mad"), e("🥳", "party", "celebrate"),
            e("😱", "scream", "shock"), e("🤯", "mind", "blown"), e("🥺", "pleading", "please"),
        ]),
        Group(title: "Gestures & People", entries: [
            e("👍", "thumbs", "up", "good", "like"), e("👎", "thumbs", "down", "bad"),
            e("👏", "clap"), e("🙌", "raise", "hands", "celebrate"), e("🤝", "handshake", "deal"),
            e("✌️", "peace", "victory"), e("🤞", "fingers", "crossed", "luck"), e("👌", "ok"),
            e("💪", "muscle", "strong"), e("🙏", "pray", "thanks"), e("👋", "wave", "hi", "bye"),
            e("🧠", "brain", "mind"), e("👀", "eyes", "look"), e("🗣️", "speak", "say"),
        ]),
        Group(title: "Objects & Work", entries: [
            e("📝", "note", "write", "memo"), e("📋", "clipboard", "list", "tasks"),
            e("📌", "pin", "pushpin"), e("📎", "clip", "paperclip"), e("📁", "folder"),
            e("📂", "folder", "open"), e("🗂️", "index", "cards", "files"), e("📅", "calendar", "date"),
            e("📆", "calendar", "tear"), e("⏰", "alarm", "clock", "time"), e("⏳", "hourglass", "time"),
            e("💻", "laptop", "computer", "work"), e("🖥️", "desktop", "computer"), e("⌨️", "keyboard"),
            e("🖱️", "mouse"), e("📱", "phone", "mobile"), e("📷", "camera", "photo"),
            e("🔋", "battery"), e("💡", "idea", "light", "bulb"), e("🔎", "search", "magnify"),
            e("🔍", "search", "magnify"), e("📊", "chart", "graph", "bar"), e("📈", "chart", "up", "growth"),
            e("📉", "chart", "down"), e("🧮", "abacus", "calc", "math"), e("📚", "books", "read"),
            e("📖", "book", "open", "read"), e("🔖", "bookmark", "tag"), e("✏️", "pencil", "edit"),
            e("🖊️", "pen", "write"), e("✂️", "scissors", "cut"), e("📦", "box", "package"),
            e("🗃️", "cabinet", "files", "box"), e("🗄️", "cabinet", "drawer"), e("🧾", "receipt", "bill"),
            e("💼", "briefcase", "work", "job"), e("🔑", "key", "unlock"), e("🔒", "lock", "secure"),
            e("🔓", "unlock", "open"), e("⚙️", "gear", "settings", "config"), e("🛠️", "tools", "wrench"),
            e("🧰", "toolbox"), e("🧲", "magnet"), e("🔗", "link", "chain"),
        ]),
        Group(title: "Symbols & Status", entries: [
            e("✅", "check", "done", "complete"), e("❌", "cross", "no", "cancel"), e("⭐", "star", "favorite"),
            e("🌟", "star", "sparkle"), e("✨", "sparkles", "new"), e("🔥", "fire", "hot", "streak"),
            e("💧", "water", "drop"), e("⚡", "bolt", "fast", "energy"), e("🚀", "rocket", "launch", "fast"),
            e("🎯", "target", "goal"), e("🏆", "trophy", "win"), e("🥇", "gold", "first", "medal"),
            e("🎉", "party", "celebrate", "tada"), e("🎊", "confetti", "party"), e("🔔", "bell", "notification"),
            e("🔕", "bell", "mute", "silent"), e("❗", "exclamation", "important"), e("❓", "question"),
            e("‼️", "double", "exclamation"), e("♻️", "recycle", "repeat"), e("🆕", "new"),
            e("🚩", "flag", "report"), e("🏁", "finish", "checkered", "flag"), e("💯", "hundred", "perfect"),
            e("🔴", "red", "circle"), e("🟠", "orange", "circle"), e("🟡", "yellow", "circle"),
            e("🟢", "green", "circle"), e("🔵", "blue", "circle"), e("🟣", "purple", "circle"),
            e("⚪", "white", "circle"), e("⚫", "black", "circle"),
        ]),
        Group(title: "Nature & Weather", entries: [
            e("🌱", "seedling", "plant", "grow"), e("🌿", "herb", "plant"), e("🍀", "clover", "luck"),
            e("🌳", "tree"), e("🌲", "evergreen", "tree"), e("🌸", "blossom", "flower"),
            e("🌼", "flower", "daisy"), e("🌻", "sunflower"), e("🌞", "sun", "sunny"),
            e("🌤️", "sun", "cloud"), e("☁️", "cloud"), e("🌧️", "rain"),
            e("⛈️", "storm", "thunder"), e("❄️", "snow", "cold"), e("🌈", "rainbow"),
            e("🌊", "wave", "ocean", "water"), e("🌍", "earth", "world", "globe"), e("🪐", "planet", "saturn"),
            e("🌙", "moon", "night"), e("⭐️", "star", "night"),
        ]),
        Group(title: "Food & Drink", entries: [
            e("☕", "coffee", "cafe"), e("🍵", "tea"), e("🍎", "apple", "fruit"),
            e("🍊", "orange", "fruit"), e("🍋", "lemon"), e("🍌", "banana"),
            e("🍇", "grapes"), e("🍓", "strawberry"), e("🥑", "avocado"),
            e("🍕", "pizza"), e("🍔", "burger"), e("🍞", "bread"),
            e("🍰", "cake", "dessert"), e("🍫", "chocolate"), e("🍺", "beer"),
            e("🍷", "wine"), e("🥗", "salad", "healthy"),
        ]),
        Group(title: "Travel & Places", entries: [
            e("🏠", "home", "house"), e("🏢", "office", "building"), e("🏫", "school"),
            e("🏥", "hospital"), e("🏦", "bank"), e("🛫", "flight", "travel", "departure"),
            e("🚗", "car", "drive"), e("🚲", "bike", "bicycle"), e("🚆", "train"),
            e("⛵", "boat", "sail"), e("🗺️", "map", "travel"), e("🧭", "compass", "direction"),
            e("🏖️", "beach", "vacation"), e("⛰️", "mountain"), e("🏃", "run", "exercise"),
        ]),
        Group(title: "Activities", entries: [
            e("⚽", "soccer", "football"), e("🏀", "basketball"), e("🎮", "game", "controller"),
            e("🎲", "dice", "game"), e("🎵", "music", "note"), e("🎧", "headphones", "music"),
            e("🎨", "art", "paint"), e("📷", "camera", "photo"), e("🎬", "movie", "film"),
            e("🧘", "yoga", "meditate"), e("🏋️", "workout", "gym"), e("🧗", "climbing"),
        ]),
    ]

    private static func e(_ emoji: String, _ keywords: String...) -> Entry {
        Entry(emoji: emoji, keywords: keywords)
    }

    static func filtered(query: String) -> [Group] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return groups }
        return groups.compactMap { group in
            let matches = group.entries.filter { entry in
                entry.keywords.contains { $0.contains(trimmed) }
            }
            return matches.isEmpty ? nil : Group(title: group.title, entries: matches)
        }
    }
}
