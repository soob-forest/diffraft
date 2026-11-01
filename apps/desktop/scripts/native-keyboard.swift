import AppKit
import ApplicationServices

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(64)
}

let args = CommandLine.arguments
guard args.count >= 4, let pid = Int32(args[1]),
      let app = NSRunningApplication(processIdentifier: pid),
      let executable = app.executableURL,
      executable.standardizedFileURL == URL(fileURLWithPath: args[2]).standardizedFileURL,
      executable.lastPathComponent == "docreview",
      args[2].contains("/src-tauri/target/") else {
    fail("테스트 앱 PID와 실행 경로가 일치해야 합니다.")
}
guard AXIsProcessTrusted() else { fail("실제 키보드 검사에 macOS 접근성 권한이 필요합니다.") }
let allowed: Set<CGKeyCode> = [36, 48, 49, 53, 115, 125, 126]
let keys = args.dropFirst(3).map { value -> CGKeyCode in
    guard let key = CGKeyCode(value), allowed.contains(key) else { fail("허용된 검사 키만 사용할 수 있습니다.") }
    return key
}
app.activate(options: [.activateAllWindows])
Thread.sleep(forTimeInterval: 0.15)
guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { fail("테스트 앱이 전면에 있어야 합니다.") }
for key in keys {
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false) else { fail("키보드 이벤트를 만들지 못했습니다.") }
    down.postToPid(pid)
    up.postToPid(pid)
    Thread.sleep(forTimeInterval: 0.15)
}
