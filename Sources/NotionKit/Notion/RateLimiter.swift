import Foundation

/// Serializes outgoing requests with a minimum spacing between them.
actor RateLimiter {
    private let minSpacing: TimeInterval
    private var nextAvailable: Date = .distantPast

    init(minSpacing: TimeInterval) {
        self.minSpacing = minSpacing
    }

    /// Waits until it is this caller's turn, then reserves the next slot.
    func acquire() async {
        let now = Date()
        let start = max(now, nextAvailable)
        let wait = start.timeIntervalSince(now)
        nextAvailable = start.addingTimeInterval(minSpacing)
        if wait > 0 {
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        }
    }

    /// Pushes the next available slot out to at least `date`, e.g. after a 429's Retry-After.
    func delay(until date: Date) {
        nextAvailable = max(nextAvailable, date)
    }
}
