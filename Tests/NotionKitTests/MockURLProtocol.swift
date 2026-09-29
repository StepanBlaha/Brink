import Foundation

/// Intercepts requests for tests. Register handlers in order; each is consumed once per matching request.
final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    struct Response {
        let status: Int
        let headers: [String: String]
        let body: Data
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [(URLRequest) -> Response?] = []
    nonisolated(unsafe) private static var requestTimestamps: [Date] = []

    static func reset() {
        lock.lock(); defer { lock.unlock() }
        handlers = []
        requestTimestamps = []
    }

    static func queue(_ handler: @escaping (URLRequest) -> Response?) {
        lock.lock(); defer { lock.unlock() }
        handlers.append(handler)
    }

    static var timestamps: [Date] {
        lock.lock(); defer { lock.unlock() }
        return requestTimestamps
    }

    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.requestTimestamps.append(Date())
        let handler = Self.handlers.isEmpty ? nil : Self.handlers.removeFirst()
        Self.lock.unlock()

        guard let handler, let response = handler(request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let httpResponse = HTTPURLResponse(
            url: request.url!,
            statusCode: response.status,
            httpVersion: "HTTP/1.1",
            headerFields: response.headers
        )!
        client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: response.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
