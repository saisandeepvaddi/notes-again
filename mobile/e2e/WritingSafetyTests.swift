import XCTest

final class WritingSafetyTests: XCTestCase {
  private var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    XCTAssertTrue(
      ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"]?.hasPrefix("Notes Again writing safety audit") == true,
      "Run these checks only on a disposable simulator created for writing-safety tests."
    )
    app = XCUIApplication(bundleIdentifier: "dev.notesagain.app")
    app.launch()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
  }

  private func openNewNote() {
    app.open(URL(string: "notesagain://notes")!)
    XCTAssertTrue(app.tabBars.buttons["Notes"].waitForExistence(timeout: 20), app.debugDescription)
    app.buttons["New note"].tap()
    XCTAssertTrue(app.textViews["note-title"].waitForExistence(timeout: 20), app.debugDescription)
  }

  private func discardIfNeeded() {
    let discard = app.buttons["Discard draft"]
    if discard.exists {
      discard.tap()
      app.alerts.buttons["Discard draft"].tap()
    }
  }

  private func bodyEditor() -> XCUIElement {
    let editor = app.webViews.textViews["editable markdown"].firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 20), app.debugDescription)
    return editor
  }

  private func expectEmptyTitle(_ title: XCUIElement) {
    let cleared = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in (title.value as? String ?? "").isEmpty },
      object: nil
    )
    XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 5), .completed)
  }

  func testDraftSurvivesDismissalAndRelaunchThenDiscards() {
    openNewNote()
    discardIfNeeded()
    let title = app.textViews["note-title"]
    title.tap()
    title.typeText("Native recoverable draft")
    let body = bodyEditor()
    body.tap()
    body.typeText("Keep this observation after an interruption.")
    app.buttons["Close"].tap()
    openNewNote()
    XCTAssertEqual(title.value as? String, "Native recoverable draft")
    XCTAssertTrue((bodyEditor().value as? String ?? "").contains("Keep this observation"))

    let start = app.navigationBars.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
    let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95))
    start.press(forDuration: 0.1, thenDragTo: end)
    XCTAssertTrue(app.buttons["Close"].waitForNonExistence(timeout: 10))
    openNewNote()
    XCTAssertEqual(title.value as? String, "Native recoverable draft")

    app.terminate()
    app.launch()
    openNewNote()
    XCTAssertEqual(title.value as? String, "Native recoverable draft")
    XCTAssertTrue((bodyEditor().value as? String ?? "").contains("Keep this observation"))
    app.buttons["Discard draft"].tap()
    app.alerts.buttons["Keep editing"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    XCTAssertEqual(title.value as? String, "Native recoverable draft")
    app.buttons["Discard draft"].tap()
    app.alerts.buttons["Discard draft"].tap()
    XCTAssertTrue(app.alerts.firstMatch.waitForNonExistence(timeout: 5))
    expectEmptyTitle(title)
    app.terminate()
    app.launch()
    openNewNote()
    expectEmptyTitle(title)
    XCTAssertFalse(app.buttons["Discard draft"].exists)
    app.buttons["Close"].tap()
  }

  func testCreationAndSharingLatestEdits() {
    openNewNote()
    discardIfNeeded()
    let name = "Native share \(UUID().uuidString.prefix(8))"
    let title = app.textViews["note-title"]
    title.tap()
    title.typeText(name)
    let body = bodyEditor()
    body.tap()
    body.typeText("Original native content.")
    app.buttons["Save"].tap()
    XCTAssertTrue(app.buttons["Save"].waitForNonExistence(timeout: 20))
    app.tabBars.buttons["Notes"].tap()
    let row = app.links.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20), app.debugDescription)
    row.tap()
    let editedBody = bodyEditor()
    editedBody.tap()
    editedBody.typeText(" Latest native edits.")
    app.buttons["Share as Markdown"].tap()
    let copy = app.cells["Copy"]
    XCTAssertTrue(copy.waitForExistence(timeout: 20), app.debugDescription)
    copy.tap()
    XCTAssertTrue(copy.waitForNonExistence(timeout: 10))
    app.terminate()
    app.launch()
    openNewNote()
    expectEmptyTitle(app.textViews["note-title"])
    app.buttons["Close"].tap()
  }
}
