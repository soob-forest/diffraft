import AppKit
import ApplicationServices

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(64)
}

func targetApplication() -> NSRunningApplication {
    let args = CommandLine.arguments
    guard args.count == 4, let pid = Int32(args[1]),
          let app = NSRunningApplication(processIdentifier: pid),
          let executable = app.executableURL,
          executable.standardizedFileURL == URL(fileURLWithPath: args[2]).standardizedFileURL,
          executable.lastPathComponent == "docreview",
          args[2].contains("/src-tauri/target/") else {
        fail("테스트 앱 PID와 실행 경로가 일치해야 합니다.")
    }
    return app
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return value
}

func findQuit(_ element: AXUIElement, _ depth: Int) -> AXUIElement? {
    guard depth < 6 else { return nil }
    let titles = ["Quit docreview", "Quit DocReview", "DocReview 종료", "docreview 종료"]
    if let title = attribute(element, kAXTitleAttribute) as? String, titles.contains(title) {
        return element
    }
    for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] {
        if let found = findQuit(child, depth + 1) { return found }
    }
    return nil
}

func menuQuit(_ app: NSRunningApplication) {
    guard let menu = attribute(AXUIElementCreateApplication(app.processIdentifier), kAXMenuBarAttribute),
          let quit = findQuit(menu as! AXUIElement, 0),
          AXUIElementPerformAction(quit, kAXPressAction as CFString) == .success else {
        fail("테스트 앱의 종료 메뉴를 실행하지 못했습니다.")
    }
}

let app = targetApplication()
switch CommandLine.arguments[3] {
case "menu-quit": menuQuit(app)
case "application-quit":
    guard app.terminate() else { fail("테스트 앱에 종료 이벤트를 보내지 못했습니다.") }
default: fail("지원하지 않는 종료 방식입니다.")
}
