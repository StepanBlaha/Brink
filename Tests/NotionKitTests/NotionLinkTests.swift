import XCTest
@testable import NotionKit

final class NotionLinkTests: XCTestCase {
    func testCompactIDDropsDashes() {
        XCTAssertEqual(NotionLink.compactID("12ab-34cd-56ef"), "12ab34cd56ef")
        XCTAssertEqual(NotionLink.compactID("plain"), "plain")
    }

    func testPreferredURLFollowsAppInstall() {
        XCTAssertEqual(NotionLink.preferredURL(id: "a-b", appInstalled: true)?.absoluteString, "notion://www.notion.so/ab")
        XCTAssertEqual(NotionLink.preferredURL(id: "a-b", appInstalled: false)?.absoluteString, "https://www.notion.so/ab")
    }

    func testRowTargetTitleAndKey() {
        let target = RowPageTarget(pinID: "p", rowID: "r-1", title: "  ")
        XCTAssertEqual(target.displayTitle, "Untitled")
        XCTAssertEqual(RowPageTarget(pinID: "p", rowID: "r", title: " Ship it ").displayTitle, "Ship it")
        XCTAssertEqual(target.cacheKey, "row-r-1")
        XCTAssertTrue(target.isFor(pin: "p"))
        XCTAssertFalse(target.isFor(pin: "q"))
    }
}
