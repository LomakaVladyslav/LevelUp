import XCTest

// Isolated local QA account only. See README.md for setup and limitations.
final class ProductFlow: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "com.vladyslav.levelup")
  func element(_ name: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: name).firstMatch }
  func tap(_ target: XCUIElement) {
    XCTAssertTrue(target.waitForExistence(timeout: 20), app.debugDescription)
    target.tap()
  }
  func reveal(_ target: XCUIElement) {
    _ = target.waitForExistence(timeout: 10)
    for _ in 0..<10 {
      if target.exists && target.isHittable { return }
      if target.exists && target.frame.maxY < app.frame.midY { app.swipeDown() }
      else { app.swipeUp() }
    }
    XCTAssertTrue(target.isHittable, app.debugDescription)
  }
  func enter(_ field: XCUIElement, _ value: String) {
    tap(field)
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 8))
    let previous = field.value as? String ?? ""
    if previous == value { return }
    if !previous.isEmpty && previous != field.placeholderValue {
      // A tap in the middle of a scrolled field places the cursor inside its text.
      // Clear visible portions from the right edge, verifying the result before
      // typing. This also avoids the font-size-dependent native selection menu.
      for _ in 0..<12 {
        let current = field.value as? String ?? ""
        if current.isEmpty || current == field.placeholderValue { break }
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.utf16.count))
      }
      let cleared = field.value as? String ?? ""
      XCTAssertTrue(cleared.isEmpty || cleared == field.placeholderValue, "Input must be empty before replacement: \(cleared)")
    }
    // A single fast typeText call can drop characters in the simulator keyboard.
    for character in value { field.typeText(String(character)) }
    XCTAssertEqual(field.value as? String, value)
  }
  func shot(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    print("SCREEN \(name)\n\(app.debugDescription)")
  }
  override func tearDown() { shot("final-screen"); super.tearDown() }
  func login() {
    enter(app.textFields["Email"], "levelup-flow-0908@example.test")
    let password = app.secureTextFields["Password"]
    tap(password)
    for character in "LevelUp-QA-2026!" { password.typeText(String(character)) }
    tap(app.buttons["Log In"])
    if app.buttons["Not Now"].waitForExistence(timeout: 3) { app.buttons["Not Now"].tap() }
    XCTAssertTrue(app.buttons["Home"].waitForExistence(timeout: 30), app.debugDescription)
  }
  func launchHome() {
    continueAfterFailure = false
    app.terminate(); app.activate()
    if app.buttons["http://localhost:8082"].waitForExistence(timeout: 3) { app.buttons["http://localhost:8082"].tap() }
    if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
    if app.buttons["Close"].exists { app.buttons["Close"].tap() }
    if !app.buttons["Home"].waitForExistence(timeout: 15) { login() }
    tap(app.buttons["Home"])
    if !app.staticTexts["Hello, FlowQA!"].waitForExistence(timeout: 5), app.textFields["Email"].exists { login() }
    XCTAssertTrue(app.staticTexts["Hello, FlowQA!"].waitForExistence(timeout: 30), app.debugDescription)
  }
  func progressTab() -> XCUIElement {
    let matches = app.buttons.matching(identifier: "Progress")
    return matches.element(boundBy: max(0, matches.count - 1))
  }
  func testTaskLifecycle() {
    launchHome()
    let title = "iOS QA \(Int(Date().timeIntervalSince1970))"
    tap(app.buttons["+ Create activity"])
    enter(app.textFields["Title"], title)
    XCTAssertTrue(app.buttons["Save"].isHittable); shot("create-keyboard")
    tap(app.keyboards.buttons["Done"])
    reveal(element("Daily")); tap(element("Daily")); tap(app.buttons["Save"])
    let menu = app.buttons["Activity actions: " + title]; reveal(menu); tap(menu)
    tap(app.buttons["Edit"])
    let edited = title + " edited"
    enter(app.textFields["Title"], edited); tap(app.buttons["Save"])
    let complete = app.buttons["Complete: " + edited]; reveal(complete); complete.doubleTap()
    let completed = app.buttons["Completed: " + edited]
    XCTAssertTrue(completed.waitForExistence(timeout: 20)); XCTAssertFalse(completed.isEnabled)
    shot("completed-once")
    let editedMenu = app.buttons["Activity actions: " + edited]; reveal(editedMenu); tap(editedMenu)
    tap(app.buttons["Disable"]); tap(app.alerts.buttons["Disable"])
    XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.alerts.firstMatch)], timeout: 10), .completed)
    shot("paused-before-restart")
    // Verify the paused state survives process termination, then resume it.
    launchHome(); tap(app.buttons["Tasks"]); tap(element("Paused"))
    let resume = app.buttons["Resume: " + edited]; reveal(resume); tap(resume)
    tap(element("Active")); reveal(completed); XCTAssertFalse(completed.isEnabled)
    tap(app.buttons["Completed →"])
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", edited)).firstMatch.waitForExistence(timeout: 20))
    tap(app.buttons["Back"]); XCTAssertTrue(app.buttons["Completed →"].exists)
    shot("task-restored")
  }
  func testScreensFormsThemesAndSession() throws {
    launchHome(); shot("home")
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@ AND value CONTAINS %@", "Progress", "Total XP:")).firstMatch.exists)
    tap(app.buttons["Tasks"]); shot("tasks")
    tap(app.buttons["Create activity"])
    enter(app.textFields["Title"], "Unsubmitted accessibility draft")
    XCTAssertTrue(app.buttons["Save"].isHittable); shot("form-keyboard")
    tap(app.buttons["Cancel"])
    tap(app.buttons["Profile"]); shot("profile")
    tap(app.buttons["Settings"]); shot("settings")
    let age = app.textFields["Age"]
    enter(age, (age.value as? String) == "26" ? "25" : "26")
    tap(app.buttons["Save"])
    XCTAssertTrue(app.staticTexts["Settings saved"].waitForExistence(timeout: 15))
    let dark = app.switches["Dark theme"]; reveal(dark)
    if dark.value as? String != "1" { tap(dark) }; shot("settings-dark")
    tap(dark); shot("settings-light")
    XCTAssertEqual(dark.value as? String, "0")
    tap(app.buttons["Back"]); XCTAssertTrue(app.buttons["Settings"].exists)
    tap(progressTab())
    XCTAssertTrue(app.buttons["Achievements"].waitForExistence(timeout: 20)); shot("progress")
    let achievements = app.buttons["Achievements"]; reveal(achievements); tap(achievements)
    XCTAssertTrue(app.staticTexts["Unlocked"].waitForExistence(timeout: 20)); shot("achievements")
    tap(app.buttons["Back"])
    let history = app.buttons["Activity History"]; reveal(history); tap(history)
    let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "iOS QA")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20)); shot("history")
    tap(row); shot("history-details"); tap(app.buttons["Close"])
    tap(app.buttons["Back"]); tap(app.buttons["Profile"])
    let logout = app.buttons["Log Out"]; reveal(logout); tap(logout); tap(app.alerts.buttons["Log Out"])
    XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 20)); shot("logged-out")
    app.terminate(); app.activate()
    XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 30)); login()
    shot("logged-in-again")
    launchHome(); shot("session-restored")
    if #available(iOS 17.0, *) { try app.performAccessibilityAudit(for: .sufficientElementDescription) }
  }

  func testLoadedScreensInBothThemes() throws {
    launchHome(); shot("visual-start")
    for darkEnabled in [true, false] {
      let mode = darkEnabled ? "dark" : "light"
      tap(app.buttons["Profile"])
      XCTAssertTrue(app.staticTexts["FlowQA"].waitForExistence(timeout: 15))
      let settings = app.buttons["Settings"]; reveal(settings); tap(settings)
      let dark = app.switches["Dark theme"]; reveal(dark)
      if (dark.value as? String == "1") != darkEnabled { tap(dark) }
      tap(app.buttons["Back"]); shot(mode + "-profile")
      tap(app.buttons["Home"]); shot(mode + "-home")
      tap(app.buttons["Tasks"])
      XCTAssertTrue(app.buttons["Create activity"].waitForExistence(timeout: 20)); shot(mode + "-tasks")
      tap(progressTab())
      let achievements = app.buttons["Achievements"]
      XCTAssertTrue(achievements.waitForExistence(timeout: 20)); shot(mode + "-progress")
      let dailyXP = app.staticTexts["XP earned per day"]; reveal(dailyXP); shot(mode + "-progress-chart")
      reveal(achievements); tap(achievements)
      XCTAssertTrue(app.staticTexts["Unlocked"].waitForExistence(timeout: 20)); shot(mode + "-achievements")
      tap(app.buttons["Back"])
      let history = app.buttons["Activity History"]; reveal(history); tap(history)
      XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "iOS QA")).firstMatch.waitForExistence(timeout: 20))
      shot(mode + "-history")
      if #available(iOS 17.0, *) { try app.performAccessibilityAudit(for: .sufficientElementDescription) }
      tap(app.buttons["Back"])
    }
  }
}
