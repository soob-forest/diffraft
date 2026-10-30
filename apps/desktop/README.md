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
- “문서 목록”과 “작업·AI 요청 열기/작업 패널 접기”로 보조 패널을 조절한다. 800×600은 원문과290px 요청 패널을 함께 표시한다. 확대해720 CSS px보다 좁아지면 한 영역씩 왕복한다.

[고정 TO-BE·변경 전·새 실제 비교](../../docs/design/tobe-implementation.html)와 [TO-BE 실행·검증 기록](../../docs/development/tobe-implementation.md)에서 캡처 시점 및 남은 검증을 확인한다.

## Claude 모델 선택

`AI 연결 설정 → 기본 모델`에서 CLI 기본값·Sonnet·Opus·Haiku를 저장한다. 설치·인증 없이 설정 가능하며, 새 요청 준비 때 선택을 고정한다. `CLI 기본값`은 `--model`을 생략한다. 계정의 이용 가능 모델을 자동 조회하거나 실제 응답 모델을 추정하지 않는다.

모델 설정이 없는 환경에서는 **Opus**를 기본으로 사용한다. 이미 저장한 선택값은 유지하며, 기존 사용자는 기본 모델에서 Opus를 선택해 저장할 수 있다. 모델 필드 없는 과거 요청은 계속 CLI 기본값으로 읽는다.

설정 변경은 진행 중 요청과 기존 요청 재시도에 영향을 주지 않는다. 다른 모델로 실행하려면 새 요청을 작성한다. 재제안도 `재제안 요청 → 요청 모델 확인 → 확인 후 재제안` 순서로 실행한다. [구현·검증 기록](../../docs/development/model-selection.md)을 참고한다.

## 검사

실행 명령과 실제 OS·계정 검증의 경계는 [테스트 안내](../../docs/development/testing.md)를 따른다. 기본 자동 검사는 Claude 계정에 접근하지 않으며 네이티브 검사는 실제 WKWebView와 Rust IPC를 사용한다.

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
| `src-tauri/src/claude_adapter/` | 인증·제한된 CLI 프로세스·세션 경계 |
| `src-tauri/src/commands/` | 검증된 IPC 명령 |
| `tests/`, `src-tauri/tests/` | 단위·계약·네이티브 검사와 fixture |

공식 CLI 설치·로그인·업데이트는 앱과 별개다. 앱의 AI 연결은 공식 native CLI 2.1.295 이상 정식 버전·서명·필수 옵션·공식 구독 firstParty 인증을 진단한다. 실패한 요청은 사용자가 직접 재시도하며 사용 한도를 다시 소비할 수 있다.
