# DocReview 데스크톱 앱

Tauri·React UI와 Rust 코어로 구성된 macOS Markdown 편집·검토 앱이다. 제품 동작은 [기능 명세](../../docs/product/specification.md), 계층과 저장 계약은 [개발 설계](../../docs/development/architecture.md)를 따른다.

## 준비

macOS arm64, Xcode Command Line Tools, Node **24.22.1** / npm **11.19.1**, Rust **1.99.1**을 사용한다. 프로젝트 도구는 저장소 루트의 `.tools/`에 둔다. 전역 셸 설정은 바꾸지 않아도 된다.

Node는 [공식 배포](https://nodejs.org/dist/v24.22.1/)에서 `node-v24.22.1-darwin-arm64.tar.gz`와 `SHASUMS256.txt`를 내려받아 SHA-256을 확인한 뒤 `.tools/`에 해제한다.

Rust를 처음 준비하는 경우 아래 명령을 저장소 루트에서 실행한다. 이미 설치돼 있으면 생략한다.

```sh
repo_root="$PWD"
mkdir -p "$repo_root/.tools"
curl --fail --location https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init -o "$repo_root/.tools/rustup-init"
curl --fail --location https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init.sha256 -o "$repo_root/.tools/rustup-init.sha256"
(cd "$repo_root/.tools" && shasum -a 256 -c rustup-init.sha256)
```

위 체크섬 검증이 성공한 경우에만 설치한다.

```sh
chmod +x "$repo_root/.tools/rustup-init"
CARGO_HOME="$repo_root/.tools/cargo" RUSTUP_HOME="$repo_root/.tools/rustup" "$repo_root/.tools/rustup-init" -y --no-modify-path --profile minimal --default-toolchain 1.99.1
CARGO_HOME="$repo_root/.tools/cargo" RUSTUP_HOME="$repo_root/.tools/rustup" "$repo_root/.tools/cargo/bin/rustup" component add clippy rustfmt --toolchain 1.99.1
```

## 실행

저장소 루트에서 실행한다.

```sh
export PATH="$PWD/.tools/node-v24.22.1-darwin-arm64/bin:$PATH"
cd apps/desktop
npm ci
npm run contracts:check
npm run native:build
./src-tauri/target/debug/docreview
```

`npm ci`는 lockfile을 사용한다. 설치 스크립트는 고정된 esbuild 버전만 허용하며 사용하지 않는 Edge/Firefox 드라이버 다운로드와 선택적 fsevents 설치 스크립트는 차단한다. 일반 앱에는 Node 런타임이 포함되지 않는다.

## 사용성 개선 사용법

- 오른쪽 ‘현재 작업’에서 작업을 선택하면 목표·조건 요약 → 요청 종류·범위 → 이번 지시 → 요청 확인 → 대화가 표시된다. 조건 편집은 요약에서 펼친다. 저장 실패 시 요청과 이동은 중단된다.
- 미전송 요청과 미등록 코멘트는 문서·작업별로 앱 세션 안에서 보관한다. 앱 종료 후 초안 복원은 지원하지 않는다. 원문의 “원문 저장됨”과 초안 상태는 별개다.
- 변경 검토의 오른쪽 ‘변경 상세’에서 코멘트를 작성한다. ‘작업·대화’로 요청 맥락을 확인하며, 좁은 창은 ‘변경 상세·코멘트’와 ‘본문으로 돌아가기’로 전환한다.
- 저장·파일 위치는 제목 옆 문서 메뉴, 버전 기록은 본문 하단, 목차·변경 목록은 왼쪽 ‘문서 탐색’에서 연다. 긴 인용은 변경 위치 주변4줄을 먼저 보여주며 전문을 펼칠 수 있다.
- 코멘트 작성 중 후보가 바뀌면 기존 인용과 초안을 확인하고 “현재 선택으로 대상 재확인”을 누른다. 코멘트 저장은 AI를 실행하지 않는다.
- “검토 이어가기”로 유효한 미처리 제안을 열고, 선택 번호·제목을 확인한 뒤 승인한다. 승인 후 “이번 적용 전 버전 비교·복원”으로 이전 내용을 확인할 수 있다.
- 상단 “문서 목록”과 “AI 요청·변경 상세 열기/요청·상세 접기”로 보조 패널을 닫았다 다시 연다. 좌우 경계선을 드래그하거나 포커스를 두고 방향키·Home/End로 너비를 조절한다. 같은 앱 세션에서 문서를 바꿔도 요청 패널 너비·열림 상태를 유지한다. 본문은 남은 공간을 사용한다. 버전 기록은 펼친 뒤 아래 조절점으로 높이를 바꾼다. 720 CSS px보다 좁으면 본문과 요청을 한 영역씩 왕복한다.
- 완료한 문서는 문서명 옆 체크 버튼으로 목록에서 제거한다. 원문·조건·초안 저장 성공 후 적용하며 파일·작업·이력은 보존한다. 왼쪽 “완료한 문서 → 다시 열기”로 이동·재실행 뒤에도 내부 문서까지 복구한다. 목록 제거는 웹뷰 localStorage에 문서 ID만 보관한다. [보완 결정과 검증](../../docs/development/workspace-panels-followup.md)을 참고한다.

[고정 TO-BE·변경 전·새 실제 비교](../../docs/design/tobe-implementation.html)와 [TO-BE 실행·검증 기록](../../docs/development/tobe-implementation.md)에서 캡처 시점 및 남은 검증을 확인한다.

## Codex와 Claude 선택

오른쪽 위 톱니바퀴 `AI 연결 설정`에서 공급자를 선택해 저장한다. 새 데이터는 Codex, 기존 데이터는 Claude를 유지한다. 공식 Codex 0.165.0 이상과 기존 ChatGPT 인증으로 사용할 수 있으며 Claude 계정은 필요하지 않다. `상태·모델 목록 조회 → 모델 설정 저장 → 연결 테스트`로 확인한다. 미로그인 상태는 `ChatGPT 로그인 열기` 또는 `codex login`, 실행 경로는 진단 정보에서 설정한다.

Codex의 기본 모델은 요청 확인 전 구체적인 ID·effort로 확정한다. Claude는 CLI 기본값·Sonnet·Opus·Haiku를 제공한다. 선택 저장은 오프라인이며 실제 요청과 연결 테스트만 사용량을 소비할 수 있다. 설정 변경은 준비된 요청·진행 중 요청·명시적 재시도의 공급자와 모델을 바꾸지 않는다. 다른 선택을 사용하려면 새 요청을 작성한다.

Claude 모델 설정이 없는 환경에서는 **Opus**를 기본으로 사용한다. 이미 저장한 선택값은 유지하며, 기존 사용자는 기본 모델에서 Opus를 선택해 저장할 수 있다. 모델 필드 없는 과거 요청은 계속 Claude CLI 기본값으로 읽는다. 재제안도 `재제안 요청 → 요청 모델 확인 → 확인 후 재제안` 순서로 실행한다. [Claude 구현·검증 기록](../../docs/development/model-selection.md)을 참고한다.

Codex는 공식 App Server의 표준 입출력 프로토콜과 관리형 ChatGPT 인증을 사용한다. API 키·토큰 복제·웹 자동화 경로는 제공하지 않는다. 계정·모델·권한 제한을 확인하지 못하면 생성을 시작하지 않는다. 구현 결정과 검증 결과는 [Codex 실행 기록](../../docs/development/codex-integration.md)을 따른다.

## 검사

실행 명령과 실제 OS·계정 검증의 경계는 [테스트 안내](../../docs/development/testing.md)를 따른다. 기본 자동 검사는 실제 AI 계정에 접근하지 않으며 네이티브 검사는 실제 WKWebView와 Rust IPC를 사용한다.

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run native:fmt
npm run native:check
npm run native:test
npm run contracts:check
npm run build
```

네이티브 화면 검사는 E2E 빌드 완료 후 `npm run test:e2e`로 실행한다. 빌드와 E2E를 동시에 실행하지 않는다. E2E와 일반 앱은 같은 debug 실행 파일을 사용하므로 검사 후 `npm run native:build`로 일반 앱을 복원한다.

## 설치 파일

```sh
npm run native:bundle:internal
```

최적화된 arm64 앱과 DMG를 `src-tauri/target/release/bundle/`에 만든다. ad-hoc 서명이며 Apple 공증을 수행하지 않는다. E2E·장애 주입·개발용 계약 생성 feature는 제외하고 실행 파일 목록·메타데이터·서명·아키텍처·테스트 코드 제외를 검사한다. [설치·백업·앱 교체](../../docs/installation.md)를 참고한다.

## 코드 경계

| 경로 | 책임 |
| --- | --- |
| `src/` | React 화면·편집기·타입 IPC |
| `src/generated/` | Rust에서 생성된 TypeScript 타입·AI JSON Schema |
| `src-tauri/src/domain/` | 직렬화 계약과 순수 검증 |
| `src-tauri/src/document/` | 원문·범위·diff 처리 |
| `src-tauri/src/storage/` | 파일·SQLite·저장 저널 |
| `src-tauri/src/claude_adapter/` | Claude 인증·공통 프로세스 소유권·세션 경계 |
| `src-tauri/src/codex_adapter/` | ChatGPT 인증·제한된 App Server·모델·turn 이벤트 |
| `src-tauri/src/providers.rs` | 저장 요청을 기준으로 공급자 실행 분기 |
| `src-tauri/src/commands/` | 검증된 IPC 명령 |
| `tests/`, `src-tauri/tests/` | 단위·계약·네이티브 검사와 fixture |

공식 CLI 설치·로그인·업데이트는 앱과 별개다. Claude는 2.1.295 이상 정식 native CLI·서명·필수 옵션·firstParty 인증을, Codex는 0.165.0 이상·필수 App Server 계약·ChatGPT 인증을 진단한다. 실패한 요청은 사용자가 직접 재시도하며 사용 한도를 다시 소비할 수 있다.
