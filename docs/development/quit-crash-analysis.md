# 직접 종료 시 크래시 분석

2026-10-29 · 분석 기준 `6302b1c` · [정규화한 보고서 근거](quit-crash-evidence.json)

## 결론

현재 설치본에서 실제 네이티브 크래시가 확인됐다. 최신 보고서의 바이너리 UUID가 두 Applications 설치본과 같으므로 이전 앱 실행으로 생긴 보고서가 아니다. 주 스레드의 WebKit 화면 여백 갱신 콜백에서 잘못된 주소를 읽었다.

**가장 유력한 원인은 종료 중 WebKit 객체의 수명과 예약된 화면 갱신 콜백이 충돌하는 문제다.** 동일 함수의 객체 수명 결함을 수정한 WebKit 공식 변경이 있다. 다만 이 앱에서 정확히 같은 결함이 발생했는지, 어떤 종료 조작·타이밍이 유발하는지는 추가 재현이 필요하다. 앱의 종료 순서가 유발 조건일 가능성도 남는다. 원인 후보와 확정 사실을 구분한다.

## Problem 1-Pager

| 항목 | 내용 |
| --- | --- |
| 배경 | 사용자가 앱을 직접 종료한 뒤 macOS 크래시 보고서가 간헐적으로 표시된다. |
| 문제 | 종료 전 저장 검사는 통과했지만 프로세스의 정상 종료 여부를 별도로 증명하지 않았다. |
| 목표 | 현재 설치본의 보고서 여부, 충돌 위치, 종료 경로, 기존 검사 공백과 후속 검증을 특정한다. |
| 비목표 | 이번 분석에서 런타임 동작·의존성·설치본을 변경하거나 사용자 문서로 종료를 반복하지 않는다. |
| 제약 | 사용자 원문·요청·계정·전체 크래시 덤프는 저장소에 추가하지 않는다. 재현은 별도 임시 DB와 가짜 CLI를 쓴다. |

## 확인한 증거

- 최신 보고서: `docreview-2026-10-29-111014.ips`, 실제 충돌 시각 11:10:09 KST. 실행 시작은 10:55:10이다. 파일명 시각과 captureTime을 구분한다.
- macOS `26.2 (25C56)`, 시스템 WebKit `21623.1.14.11.9`.
- 두 설치본 SHA-256: `40dba189b04a3e08abebae823c9d1025e8fc3b8f3ba9f5ef48a701b5c72e5dd3`.
- 최신 보고서와 설치본 UUID: `758CAF45-FA27-33DD-AFBD-D064A67308DE`.
- `EXC_BAD_ACCESS / SIGSEGV`, `KERN_INVALID_ADDRESS at 0x640`, faulting thread `0`.
- 최상위 프레임: `WebKit::WebPageProxy::dispatchSetObscuredContentInsets()` → `WTF::RunLoop::performWork()`.

| 보고서 파일명 시각(KST) | 설치 앱 / 개발 실행 | 충돌 함수 |
| --- | --- | --- |
| 10-28 21:53:53 | 설치 앱 | dispatchSetObscuredContentInsets |
| 10-28 21:58:06 | 설치 앱 | dispatchSetObscuredContentInsets |
| 10-29 09:12:50 | 설치 앱 | dispatchSetObscuredContentInsets |
| 10-29 09:47:46 | 설치 앱 | dispatchSetObscuredContentInsets |
| 10-29 10:24:11 | 개발 실행 | dispatchSetObscuredContentInsets |
| 10-29 10:36:16 | 개발 실행 | dispatchSetObscuredContentInsets |
| 10-29 10:36:22 | 개발 실행 | setObscuredContentInsets → dispatchSetObscuredContentInsets |
| 10-29 11:10:14 | 설치 앱 | dispatchSetObscuredContentInsets |

8개 모두 같은 화면 여백 갱신 계열의 SIGSEGV다. 여러 빌드에서 반복됐고 최신 TO-BE 빌드 전에도 발생했다. 개별 보고서에는 사용자가 누른 메뉴·단축키·창 닫기 조작이 기록되지 않아, 8건 전체를 특정 종료 조작에 연결할 수는 없다. 원본 파일은 사용자 DiagnosticReports에 유지하고 저장소에는 필요한 메타데이터와 해시만 기록했다.

## 앱의 종료 호출 경로

1. Cmd+Q/종료 메뉴의 AppKit 요청은 `native/termination.m`의 `applicationShouldTerminate:`로 들어온다.
2. `native_termination.rs::request_close` → `main.rs::request_close`가 메인 창의 `close()`를 요청하고 AppKit 기본 종료를 취소한다. Tauri `ExitRequested`도 같은 보호 경로를 사용한다.
3. `src/workspace.ts::useClose`가 `onCloseRequested`를 취소하고 새 입력을 잠근다.
4. 원문·작업 조건 `flushRef` → `shutdown_generation` → `Coordinator::shutdown` 순서로 저장과 CLI 중단을 기다린다.
5. 완료 후 프런트엔드가 `window.destroy()`를 호출한다. Tauri 런타임의 창 파괴·마지막 창 종료 처리와 Wry의 WebView 분리가 이어진다.

현재 보고서의 직접 충돌 위치는 SQLite 저장·AI CLI·React 예외가 아니라 네이티브 WebKit 콜백이다. 이 사실만으로 해당 종료의 저장 완료나 데이터 무손실까지 증명되지는 않는다. flush와 CLI 중단을 제거하는 우회는 저장 계약을 깨므로 검토 대상에서 제외한다.

관련 구현은 `src/workspace.ts`, `src/connection/api.ts`, `src-tauri/src/main.rs`, `native_termination.rs`, `native/termination.m`, `commands/generation.rs`, `claude_adapter/coordinator.rs`다. 읽은 외부 구현은 잠금 버전 Tauri runtime `2.12.3`의 `on_window_close`/`Destroyed` 경로와 Wry `0.57.1`의 `InnerWebView::drop`이다. 의존성 파일은 수정하지 않았다.

## WebKit 공식 근거와 추론 한계

[WebKit 수정 79f65b1](https://github.com/WebKit/WebKit/commit/79f65b10f8d873bf68b0468c7bdca1d9d38de667)은 같은 `dispatchSetObscuredContentInsets` 경로에서 약한 참조로 호출하는 동안 `WebPageProxy`가 파괴되는 문제를 설명한다. 수정은 메인 RunLoop 콜백에서 호출 동안 강한 참조를 잡도록 바꾼다. 보고서의 함수·RunLoop 경로·잘못된 주소 접근과 부합한다.

이는 원인 후보를 강하게 뒷받침하지만, 현재 macOS의 바이너리가 해당 수정 전 코드인지 역어셈블리·심볼 비교로 검증하지 않았다. 어느 macOS 배포 버전부터 수정되는지도 확인하지 않았다. 특정 버전 업데이트나 Tauri 패키지 업데이트만으로 해결된다고 단정하지 않는다. WKWebView는 시스템 WebKit을 사용한다.

## 이번 재검증과 기존 검사 공백

- 별도 임시 DB·가짜 CLI로 E2E 전용 빌드 후 `scripts/e2e.mjs shutdown` 실행: **2단계 / 3개 통과**.
- 읽기 전용 저장 실패 시 입력·창 유지, 종료 직전 원문·조건 저장, 실행 중 CLI 중단, 재시작 후 원문·조건·취소 상태 보존을 확인했다.
- 이 실행에서 신규 DocReview 크래시 보고서는 관찰되지 않았다. 간헐 증상은 재현하지 못했다.
- 검사 후 일반 debug 빌드로 복원했다. 배포된 두 설치본과 사용자 데이터는 변경하지 않았다.

기존 `shutdown.e2e.mjs::waitForExit`는 `process.kill(pid, 0)`로 프로세스 소멸만 기다린다. 종료 코드·종료 시그널은 검사하지 않는다. 따라서 SIGSEGV로 사라져도 파일과 재시작 결과가 맞으면 통과할 수 있다. 기존 87개 통과를 **크래시 없는 정상 종료의 증명**으로 해석하면 안 된다. 이번 집중 검사도 같은 한계를 가진다.

## 대안 비교와 ADR-QUIT-001

| 대안 | 장점 | 단점 | 위험 |
| --- | --- | --- | --- |
| A. 시스템 WebKit 수정 포함 여부를 확인하고 수정된 환경과 비교 | 공식 수명 수정으로 원인을 해결할 가능성 | OS별 대조 환경이 필요하고 앱에서 시스템 프레임워크를 교체할 수 없음 | 배포 포함 여부 확인 없이 업데이트를 해결책으로 단정할 수 있음 |
| B. 앱의 저장 완료 후 종료 순서를 조정하고 정상 종료 감시 추가 | 현재 지원 환경에서 개선 여부를 직접 검증할 수 있음 | 재현과 이벤트 순서 계측이 선행돼야 함 | 성급한 강제 종료·지연·객체 누수 우회가 저장/CLI 중단을 훼손할 수 있음 |

**판정:** 먼저 종료 결과 감시로 재현을 확보한 뒤 B의 최소 변경을 평가한다. A는 수정 포함 환경과의 원인 대조로 병행할 수 있다. 근거 없는 sleep, 크래시 숨김, SIGSEGV 무시, 강제 kill을 해결책으로 쓰지 않는다.

**가정 기록:** 사용자의 ‘직접 종료’는 정상 종료 의도라는 뜻으로 해석했다. Cmd+Q·창 닫기·Dock 종료 중 무엇이었는지는 확정하지 않았다. WebKit 수명 결함은 가장 유력한 가설이며 확정 진단으로 승격하지 않는다.

**영향도:** 후속 수정 대상은 프런트엔드 저장 완료와 네이티브 창·앱 종료의 경계다. 원문/조건 flush, 저장 실패 시 창 유지, 생성 취소·자식 프로세스 회수, 중복 종료 잠금의 사전·사후 조건을 유지해야 한다.

## 후속 수정의 인수 조건

1. E2E 실행 부모가 앱 자식 프로세스의 exit code와 signal을 직접 수집하고 `code === 0 && signal === null`을 요구한다. SIGSEGV 종료가 검사에서 실패하는 회귀를 먼저 확보한다. 보고서 확인은 지연·다른 실행 혼입 가능성이 있어 보조 근거로 쓴다.
2. 임시 데이터의 앱에서 Cmd+Q·창 닫기·Dock 종료를 각각 구분하고, 편집 직후·AI 실행 중·창 크기 변경 직후·연속 종료 요청 조건을 반복한다. 사용자 설치본을 자동 종료하지 않는다.
3. 필요한 계측은 종료 단계·단조 시각·상태만 남긴다. 원문·코멘트·AI 입력·파일 경로는 로그에 남기지 않는다.
4. 콜백과 창 파괴의 순서를 대조해 최소한의 종료 변경을 선택한다. 성공 경로 외에 저장 실패·CLI 중단 실패·중복 종료를 검사한다.
5. 일반 release 앱에서도 종료 결과를 확인하고 신규 보고서·입력/조건 보존·자식 프로세스 회수를 함께 검증한 뒤 설치한다.

현재 상태는 **원인 분석 완료 / 간헐 재현과 수정 검증은 후속 작업**이다.

이후 진행은 [수정 작업 기록](quit-crash-fix.md)을 따른다. 강화한 부모 관측에서 기존 경로의 SIGSEGV를 재현했고, 저장 완료 후 창을 먼저 파괴하는 경로를 변경해 전체 네이티브88개와 종료 반복24회를 통과했다. 두 설치본을 교체했으며 일반 설치본 화면 검사는 macOS 잠금 해제 대기다. 위 내용은 분석 커밋 `b5def61` 시점의 기록이다.
