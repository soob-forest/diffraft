# 종료 크래시 수정 작업

2026-10-29 · 구현 `526939a` · 수정·자동 검사·두 설치본 교체 및 일반 앱 검증 완료 · [빌드 기록](quit-crash-build.json) · [이전 분석](quit-crash-analysis.md)

## Problem 1-Pager

| 항목 | 내용 |
| --- | --- |
| 배경 | macOS 26.2에서 직접 종료 시 WebKit insets 콜백의 SIGSEGV가 간헐 발생했다. |
| 문제 | 저장·CLI 정리 후 창을 먼저 파괴해 WebKit 콜백과 해제가 겹칠 수 있으며 기존 검사는 비정상 종료도 통과시킨다. |
| 목표 | 저장과 CLI 정리가 끝난 뒤 창을 보존한 채 Tauri 앱 종료를 완료하고 실제 exit code/signal을 검사한다. |
| 비목표 | 시스템 WebKit 교체, private API·시그널 무시·강제 kill·sleep 우회, UI 디자인 변경. |
| 제약 | 저장 실패 시 입력·창 유지, 중복 종료 잠금, 자식 프로세스 회수, 초기화 실패 앱의 종료를 보존한다. 실제 사용자 문서로 반복 종료하지 않는다. |

## ADR-QUIT-002

| 대안 | 장점 | 단점 | 위험 |
| --- | --- | --- | --- |
| A. window.destroy 후 대기/객체 유지 | 기존 경로와 유사 | 콜백 완료를 증명하기 어렵고 임의 대기나 누수가 필요 | 메모리 수명 충돌을 남기거나 숨길 수 있음 |
| B. 저장 후 CLI 정리를 마친 명령에서 AppHandle.exit(0) | 창을 먼저 파괴하지 않고 공식 Tauri 이벤트·정리 경로 사용 | 준비 완료 상태와 ExitRequested 재진입 구분 필요 | 준비 전 종료 허용 시 저장이 누락될 수 있음 |

선택 B. JS는 flush 완료 후 complete_shutdown을 호출한다. 네이티브 명령은 요청 버전/호출 창을 검증하고 기존 shutdown_generation을 기다린 뒤 종료 준비 상태를 설정한다. 준비 전 ExitRequested는 기존 보호 경로, 준비 후에는 공식 종료를 허용한다. 처음부터 ready를 허용하지 않고 실패에서는 설정하지 않는다. 창 파괴 권한도 제거한다.

근거: 잠금 버전 Tauri 2.12.5의 [AppHandle.exit](https://docs.rs/tauri/2.12.5/tauri/struct.AppHandle.html#method.exit)는 ExitRequested/Exit를 발생시키며 run은 이벤트 루프 종료 후 프로세스를 끝낸다. 시스템 WebKit의 원결함 자체를 패치하는 것은 아니며 관찰된 종료 수명 충돌 경로를 피한다.

가정: 단일 main 창이 제품의 전체 작업 공간이다. WDIO 1.5.1의 launcher가 소유한 embeddedProcesses의 ChildProcess를 읽어 부모에서 종료 결과를 수집한다. 이 고정 버전 내부 경계가 달라지거나 자식이 없으면 검사는 명시적으로 실패한다. 사용자 설치본과 E2E 데이터는 분리한다.

영향도: workspace의 저장 완료→종료 호출, main의 ExitRequested, 네이티브 종료 상태가 변경된다. 원문/조건 flush와 Coordinator.shutdown의 저장·취소 계약은 재사용한다. E2E 부모 관측은 제품 번들에 포함하지 않는다.

## 실행 순서

- [x] Q1: 종료 관측과 창 수명 계약의 회귀 검사를 먼저 실패시킨다. SIGSEGV/비정상 코드/기록 누락을 실패로 판정한다.
- [x] Q2: 부모 ChildProcess 종료 결과 수집 및 기존 종료/초기화 실패 검사 강화.
- [x] Q3: 준비 완료 후 앱 종료, 창 파괴 제거와 권한 축소.
- [x] Q4: 저장 실패·조건 flush·실행 중 AI 중단·중복 요청·재시작 및 창 생존 검사.
- [x] Q5: 창 크기/편집 직후 종료 반복과 종료 메뉴(⌘Q 동작)/창 닫기/OS 종료 이벤트 확인. 물리적 Cmd+Q 키 입력과 Dock UI 직접 클릭은 별도 미검증.
- [x] Q6: 정적·단위·Rust·네이티브 검사, 일반 debug 복원 및 release 빌드/서명 검사.
- [x] Q7: 두 설치본 교체·서명·실행 경로·데이터 보존 확인 완료. 잠금 해제 후 일반 설치본의 화면 표시와 정상 종료 코드까지 확인했다.

## 결과

### 수정 전 실패와 원인 연결

부모 종료 관측기를 적용한 기존 앱의 shutdown 검사에서 PID6866이 `code: null, signal: SIGSEGV`로 종료돼 실패했다. 새 보고서 `docreview-2026-10-29-113238.ips`의 실제 captureTime은 11:32:31 KST이며 최상위 프레임은 `WebPageProxy::setObscuredContentInsets`였다. 기존 보고서와 같은 계열로, 테스트가 통과하던 경로의 비정상 종료를 직접 잡았다(`.artifacts/quit-fix-contract-before.log`).

관측기 단위 검사는 구현 전 모듈 없음으로 실패했고 이후 정상 코드/시그널·SIGSEGV·비정상 코드·누락/기존 종료 기록을 검사한다. 프런트엔드 4개 검사도 구현 전 실패를 기록한 뒤 저장 순서·동시 요청·실패 복구·이동 잠금 계약을 확인했다. 정규 종료 코드 검사가 없던 이전 완료 해석을 철회한다.

### 구현

- useAppClose: 입력 잠금 → 원문·조건 flush → complete_shutdown. JS의 window.destroy를 제거했다.
- app_shutdown: 요청 버전·main 창 확인 → 기존 CLI shutdown 대기 → AtomicBool로 종료 준비를 한 번만 승인 → AppHandle.exit(0).
- 준비 전 ExitRequested는 저장 보호를 유지한다. 준비 후 Tauri 종료는 허용하며, 이때 중복 AppKit Quit은 계속 취소해 두 번째 종료 경로가 끼어들지 않게 한다.
- 일반/E2E의 창 destroy 권한을 제거했다. 스키마·저장/승인 도메인·의존성 잠금은 바꾸지 않았다.
- 테스트 부모가 실제 ChildProcess의 종료 결과를 기록하고 code 0/signal null을 요구한다. E2E 수명 기록은 종료 시 main WebView 생존과 ready를 함께 검사하며 제품 번들에서 제외한다.

### 중간 실패와 검사 경계

- WDIO의 서비스 상대 경로 해석 실패를 절대 파일 경로로 수정했다. IPC 오류를 WebDriver가 래핑하므로, 버전 오류 검사는 브라우저 안에서 code만 추출하도록 수정했다.
- 반복 검사 초기에는 새 문서 생성 완료 전에 이전 문서 경로를 읽는 fixture 경합이 있었다. 선택 문서 ID 변경과 빈 새 편집기 표시를 기다린 뒤 경로를 읽도록 고쳤다.
- CGEvent로 보낸 Cmd+Q는 이 자동화 환경에서 종료를 유발하지 않았다. 이를 성공으로 처리하지 않고, 실제 앱 종료 메뉴의 AXPress와 NSRunningApplication의 정상 종료 이벤트로 구분해 검사했다. 물리적 Cmd+Q 키 전달과 Dock UI 클릭을 검증했다고 주장하지 않는다. 키 전송 코드는 제품·새 테스트 도구에서 제거했다.
- 종료 메뉴 검사는 AppKit 접근성 API를 쓴다. VoiceOver를 실행하거나 점검하지 않는다.

### 최종 자동 검사와 배포

- typecheck·lint(경고0), 프런트엔드79개+종료 관측기4개, Rust226개 통과. 실제 계정/특정 환경을 요구하는 기존11개는 ignored 상태를 유지했다. Rust fmt·clippy도 통과했다.
- 최종 전체 WKWebView 회귀는 **28단계/88개 통과**(`quit-final-e2e.log`). 잘못된 종료 요청 버전, 읽기 전용 저장 실패, 원문·조건 flush, 실행 중 CLI 중단, 중복 종료, 재시작 보존, 초기화 실패 앱의 정상 종료를 포함한다.
- 네이티브 종료 반복은 **24회 통과**(`quit-fix-stress.log`): 4개 경로 각6회, 부모 exit code0/signal null·Exit 시 ready/main WebView 생존·입력 파일 일치를 매번 확인했다. 같은 앱 코드의 추가 재실행은 1회 후 macOS 자동 잠금 때문에 beforeAll의 창 표시 검사에서 중단됐다(`quit-final-stress.log`). 이 환경 실패를 제품 통과로 바꾸지 않았다. 비교 자료12개도 통과했다.
- 일반 debug를 복원한 뒤 release 앱/DMG를 생성했다. arm64·실행 파일1개·테스트 마커0·ad-hoc 서명 유효를 검사했다. 내부 배포 방식의 공증 생략 경고는 기존과 같으며 Developer ID 공증본으로 취급하지 않는다.
- **2026-10-29 11:53 KST**, 정상 종료 상태에서 두 Applications를 새 빌드로 교체했다. 실행 파일 SHA-256은 `95f8a075122514df1798b6d2b26e8eb844b06a100b3ed90c522d86489f50cab1`이다. 이전 번들과 앱 데이터 전체 백업을 남겼으며 설치 중 데이터 파일은 바뀌지 않았다.
- 기존 원문7개 해시와 DB18개 테이블 전체 행의 일치를 확인했다. 추가 문서·편집·AI 요청·승인·거절·코멘트 저장은0건이다.
- `/Applications/DocReview.app`의 새 일반 앱을 PID29266으로 실행하고 부모 관측기를 유지했다. 이후 잠금 해제 확인을 받아 원문 저장 완료·미제출 초안 없음 확인 후 종료 메뉴로 닫았다. 부모가 기록한 결과는 code0/signal null이다(`.artifacts/quit-first-install.json`).

### 일반 설치본 최종 확인 — 2026-10-29

- 사용자 잠금 해제 회신 후 `CGSSessionScreenIsLocked=false`를 확인했다. 실제 설치본의 편집기·요청 패널·원문 저장 완료 상태를 화면과 AX 메타데이터로 확인했다. 요청·코멘트 미제출 초안은 없었다. 사용자 원문이 포함된 화면 캡처는 Git에서 제외한 로컬 아티팩트에만 보관했다.
- 준비 확인 도구가 편집기 라벨의 AXTitle만 보던 조건을 AXDescription도 확인하도록 보완했다. 이전 AX 미준비 결과에는 이 검사 도구의 조건 오류도 포함될 수 있다. 제품 소스·바이너리는 변경하지 않았다.
- 시스템 Applications 설치본은 **실제 종료 메뉴**, 사용자 Applications 설치본(PID41822)은 **NSRunningApplication 정상 종료 이벤트**로 각1회 확인했다. 두 프로세스 모두 부모가 직접 관측한 **code0/signal null**이었다. 새 DocReview 크래시 보고서는 없었다.
- 검사 후 원문7개 해시·제안/코멘트/AI 이력 및 DB18개 테이블 전체 행이 기존과 같았다. 새 문서나 편집·승인·거절·AI 요청·코멘트 저장은 없었다.
- 검사를 마치고 `/Applications/DocReview.app`을 PID42314로 다시 열어뒀다. 실행 경로와 SHA-256 `95f8a075…9f50cab1`을 재확인했다.
- LaunchServices로 재실행할 때 macOS의 데스크탑 폴더 접근 확인창이 별도 화면에 나타났다. 샘플링상 기존 문서의 파일 열기에서 시작 처리가 기다리고 있었다. DocReview의 해당 권한 요청만 처리한 뒤 같은 PID의 편집기 표시를 확인했다. 제품 바이너리 변경이나 추가 크래시는 없었다.

Q1~Q7 완료. 물리적 Cmd+Q 키 입력·Dock UI 직접 클릭, 실제 계정·장시간 사용·다른 macOS 버전의 재발률 평가는 별도 미검증이다.
