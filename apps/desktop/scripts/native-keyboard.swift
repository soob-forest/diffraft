import AppKit
import ApplicationServices

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(64)
}

enum KeyPhase {
    case press, down, up
}

struct KeyCommand {
    let key: CGKeyCode
    var flags: CGEventFlags = []
    var autorepeat = false
    var phase: KeyPhase = .press
}

let allowedKeys: Set<CGKeyCode> = [36, 48, 49, 53, 98, 115, 125, 126]
let maximumCommands = 64
let keyInterval: TimeInterval = 0.15

func parseCommand(_ value: String) -> KeyCommand {
    switch value {
    case "shift:98": return KeyCommand(key: 98, flags: .maskShift)
    case "repeat:36": return KeyCommand(key: 36, autorepeat: true)
    case "repeat:49": return KeyCommand(key: 49, autorepeat: true)
    case "down:36": return KeyCommand(key: 36, phase: .down)
    case "down:49": return KeyCommand(key: 49, phase: .down)
    case "up:36": return KeyCommand(key: 36, phase: .up)
    case "up:49": return KeyCommand(key: 49, phase: .up)
    default: return parsePlainKey(value)
    }
}

func parsePlainKey(_ value: String) -> KeyCommand {
    guard let key = CGKeyCode(value), String(key) == value,
          allowedKeys.contains(key) else {
        fail("허용된 검사 키만 사용할 수 있습니다.")
    }
    return KeyCommand(key: key)
}

func verifiedApplication(_ pid: pid_t, _ path: String) -> NSRunningApplication {
    let expected = URL(fileURLWithPath: path).standardizedFileURL
    guard pid > 0, path.hasPrefix("/"), expected.path == path,
          let app = NSRunningApplication(processIdentifier: pid),
          let executable = app.executableURL?.standardizedFileURL,
          executable == expected, executable.lastPathComponent == "docreview",
          executable.path.contains("/src-tauri/target/") else {
        fail("테스트 앱 PID와 실행 경로가 일치해야 합니다.")
    }
    return app
}

func activateApplication(_ app: NSRunningApplication) {
    if app.isHidden && !app.unhide() { fail("테스트 앱의 숨김 상태를 해제할 수 없습니다.") }
    app.activate(options: [.activateAllWindows])
    let target = AXUIElementCreateApplication(app.processIdentifier)
    guard AXUIElementSetAttributeValue(target, kAXFrontmostAttribute as CFString,
                                      kCFBooleanTrue) == .success else {
        fail("검증한 테스트 앱을 전면으로 가져올 수 없습니다.")
    }
    let deadline = Date().addingTimeInterval(1)
    while NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {
        fail("검증한 테스트 앱을 전면으로 전환하지 못했습니다.")
    }
}

func postCommand(_ command: KeyCommand, _ pid: pid_t, _ path: String, _ source: CGEventSource) {
    _ = verifiedApplication(pid, path)
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else {
        fail("테스트 앱이 전면에 있어야 합니다.")
    }
    guard let down = CGEvent(keyboardEventSource: source, virtualKey: command.key, keyDown: true),
          let up = CGEvent(keyboardEventSource: source, virtualKey: command.key, keyDown: false) else {
        fail("키보드 이벤트를 만들지 못했습니다.")
    }
    down.flags = command.flags
    up.flags = command.flags
    down.setIntegerValueField(.keyboardEventAutorepeat, value: command.autorepeat ? 1 : 0)
    if command.phase != .up { postTestKey(down, command, pid) }
    if command.autorepeat { Thread.sleep(forTimeInterval: keyInterval) }
    if command.phase != .down { postTestKey(up, command, pid) }
    Thread.sleep(forTimeInterval: keyInterval)
}

func postTestKey(_ event: CGEvent, _ command: KeyCommand, _ pid: pid_t) {
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else {
        fail("키 전달 직전에 검증한 테스트 앱이 전면에 있어야 합니다.")
    }
    if command.phase != .press || command.autorepeat {
        event.post(tap: .cgSessionEventTap)
    } else {
        event.postToPid(pid)
    }
}

func windowEvidence(_ pid: pid_t) -> String {
    let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
    let owned = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }
    let evidence = owned.map { value in [
        "onScreen": value[kCGWindowIsOnscreen as String] ?? false,
        "bounds": value[kCGWindowBounds as String] ?? [:],
        "layer": value[kCGWindowLayer as String] ?? -1,
        "alpha": value[kCGWindowAlpha as String] ?? 0
    ] as [String: Any] }
    guard let data = try? JSONSerialization.data(withJSONObject: evidence),
          let json = String(data: data, encoding: .utf8) else { return "[]" }
    return json
}

let args = CommandLine.arguments
guard args.count >= 4, args.count <= maximumCommands + 3,
      let pid = Int32(args[1]), String(pid) == args[1] else {
    fail("테스트 앱 PID·실행 경로와 1~64개의 검사 키를 지정해 주세요.")
}
let focusOnly = args.count == 4 && args[3] == "--focus-only"
let commands = focusOnly ? [] : args.dropFirst(3).map(parseCommand)
let app = verifiedApplication(pid, args[2])
guard AXIsProcessTrusted() else { fail("실제 키보드 검사에 macOS 접근성 권한이 필요합니다.") }
activateApplication(app)
if focusOnly {
    print(windowEvidence(pid))
}
if !commands.isEmpty {
    guard let source = CGEventSource(stateID: .combinedSessionState) else {
        fail("로그인 세션의 키보드 이벤트 소스를 만들지 못했습니다.")
    }
    for command in commands {
        postCommand(command, pid, args[2], source)
    }
}
