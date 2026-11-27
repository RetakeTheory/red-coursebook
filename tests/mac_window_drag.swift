import AppKit
import CoreGraphics

// Inspect the test application's frame in the WindowServer's point coordinates.
let pid = pid_t(CommandLine.arguments[1])!
let mode = CommandLine.arguments[2]
let primaryTop = NSScreen.screens[0].frame.maxY
let workAreas = NSScreen.screens.map { screen -> CGRect in
    let r = screen.visibleFrame
    return CGRect(x: r.minX, y: primaryTop - r.maxY, width: r.width, height: r.height)
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func frame() -> CGRect? {
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                                   kCGNullWindowID) as? [[String: Any]] else { return nil }
    for window in windows {
        if window[kCGWindowOwnerPID as String] as? Int32 == pid,
           window[kCGWindowLayer as String] as? Int == 0,
           let bounds = window[kCGWindowBounds as String] as? NSDictionary,
           let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), rect.width > 100 {
            return rect
        }
    }
    return nil
}

func waitForFrame(_ matches: (CGRect) -> Bool) -> CGRect {
    let deadline = Date().addingTimeInterval(15)
    while Date() < deadline {
        if let rect = frame(), matches(rect) { return rect }
        Thread.sleep(forTimeInterval: 0.1)
    }
    fail("Unexpected window frame \(String(describing: frame())); work areas \(workAreas)")
}

let application = NSRunningApplication(processIdentifier: pid)!
application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
let before = waitForFrame { rect in workAreas.contains { $0.insetBy(dx: -1, dy: -1).contains(rect) } }
print("Visible window \(before); screen scale \(NSScreen.main?.backingScaleFactor ?? 0)")
if mode == "restore" { exit(0) }
guard abs(before.width - 720) <= 2, abs(before.height - 510) <= 2 else {
    fail("A 720 × 510 point window opened at \(before.size)")
}
let area = workAreas.first { $0.insetBy(dx: -1, dy: -1).contains(before) }!
let dx: CGFloat = area.maxX - before.maxX >= 55 ? 54 : -54
let dy: CGFloat = area.maxY - before.maxY >= 30 ? 28 : -28
let start = CGPoint(x: before.midX, y: before.minY + 12)
let source = CGEventSource(stateID: .hidSystemState)

func mouse(_ type: CGEventType, _ position: CGPoint) {
    guard let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: position,
                              mouseButton: .left) else { fail("Could not create a mouse event") }
    event.setIntegerValueField(.mouseEventClickState, value: 1)
    event.post(tap: .cghidEventTap)
}

Thread.sleep(forTimeInterval: 0.4)
mouse(.mouseMoved, start)
mouse(.leftMouseDown, start)
Thread.sleep(forTimeInterval: 0.12)
for step in 1...10 {
    mouse(.leftMouseDragged, CGPoint(x: start.x + dx * CGFloat(step) / 10,
                                     y: start.y + dy * CGFloat(step) / 10))
    Thread.sleep(forTimeInterval: 0.035)
}
mouse(.leftMouseUp, CGPoint(x: start.x + dx, y: start.y + dy))
let after = waitForFrame { rect in
    abs(rect.minX - before.minX - dx) <= 3 && abs(rect.minY - before.minY - dy) <= 3
}
guard after.size == before.size, area.insetBy(dx: -1, dy: -1).contains(after) else {
    fail("Title-bar drag changed the window size or clipped the window: \(before) -> \(after)")
}
print("Native title-bar drag moved \(before) to \(after) without changing its size")
