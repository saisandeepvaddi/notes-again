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
  func testDiscussScreenDisclosesContextAndNeverSendsWithoutAKey() {
    openNewNote()
    discardIfNeeded()
    let name = "Native discuss \(UUID().uuidString.prefix(8))"
    let title = app.textViews["note-title"]
    title.tap()
    title.typeText(name)
    let body = bodyEditor()
    body.tap()
    body.typeText("Discussion source body.")
    app.buttons["Save"].tap()
    XCTAssertTrue(app.buttons["Save"].waitForNonExistence(timeout: 20))
    app.tabBars.buttons["Notes"].tap()
    let row = app.links.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20), app.debugDescription)
    row.tap()
    let discuss = app.buttons["Discuss this note"]
    for _ in 0..<6 where !discuss.isHittable { app.swipeUp() }
    discuss.tap()

    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Your library is not sent")).firstMatch.waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Set your provider, model and key")).firstMatch.exists)
    let send = app.buttons["Send to provider"]
    for _ in 0..<6 where !send.exists { app.swipeUp() }
    XCTAssertTrue(send.exists)
    XCTAssertFalse(send.isEnabled)

    for _ in 0..<6 where !app.buttons["Explain"].isHittable { app.swipeDown() }
    app.buttons["Explain"].tap()
    for _ in 0..<6 where !send.exists { app.swipeUp() }
    XCTAssertFalse(send.isEnabled, "A suggestion alone must not send without a key")

    for _ in 0..<6 where !app.buttons["Discuss settings"].isHittable { app.swipeDown() }
    app.buttons["Discuss settings"].tap()
    let key = app.secureTextFields["AI provider API key"]
    XCTAssertTrue(key.waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "no automatic retries")).firstMatch.exists)
    app.terminate()
    app.launch()
    openNewNote()
    app.buttons["Close"].tap()
  }
}
