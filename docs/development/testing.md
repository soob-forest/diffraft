# 테스트와 검증 범위

[개발 환경](../../apps/desktop/README.md#준비)을 준비하고 `apps/desktop`에서 실행한다. 기본 자동 검사는 실제 계정과 네트워크 대신 합성 문서·임시 DB·가짜 CLI를 사용한다.

## 정적 검사와 단위 테스트

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

TypeScript는 미사용 지역 변수·매개변수도 검사한다. Rust clippy는 경고를 오류로 취급한다. `native:test`와 `native:check`의 `test-support` feature는 저장·복구 장애 주입용이며 일반 앱에는 포함하지 않는다.

IPC 타입과 AI JSON Schema는 Rust에서 생성한다. `contracts:check`가 현재 생성물과 일치하는지 확인하며, 변경이 필요하면 `npm run contracts`로 재생성한다. 생성된 파일을 직접 수정하지 않는다.

## 네이티브 E2E

```sh
npm run native:build:e2e
npm run test:e2e
```

실제 Tauri/WKWebView·Rust IPC·SQLite·임시 문서 파일을 사용한다. 파일 선택은 테스트가 소유한 경로로 대체하고 AI는 가짜 CLI로 실행한다. 정상 저장·승인·복원과 함께 권한 실패·외부 충돌·잘못된 응답·중단·강제 종료 및 재시작 경로를 검사한다.

화면 잠금을 해제하고 빌드가 끝난 뒤 실행한다. embedded 드라이버는 한 번에 앱 한 개만 사용한다. Cargo/앱 빌드와 네이티브 E2E를 동시에 실행하지 않는다.

실행기는 완료된 E2E 빌드의 SHA-256·전용 명령 표시와 소유한 비공개 임시 폴더를 앱 시작 전에 검사한다. 빌드 시작 시 이전 증명을 무효화하고 성공한 뒤에만 다시 발급한다. 일반 빌드·미완료 빌드·바뀐 바이너리·비소유 폴더는 차단한다. WDIO 직접 실행에도 같은 검사가 적용된다. 이 검사는 동시 실행 허가가 아니며 Cargo/build/E2E 순차 실행을 유지한다.

특정 흐름만 검사하려면 다음처럼 실행한다.

```sh
npm run test:e2e -- connection
npm run test:e2e -- shutdown
npm run test:e2e -- quit
```

선택 실행: `request-followup`, `request-workflow`, `rewrite-review`, `rewrite-review-keyboard`, `review-followup`, `selection-popover`, `selection-transitions`, `source-lifecycle`, `ux`, `ux-extensions`, `ux-local`, `ux-recovery`, `ux-reliability`, `ux-native`, `tobe`, `design`, `design-resume`, `usability`, `connection`, `model-selection`, `codex`, `codex-recovery`, `codex-keyboard`, `codex-native`, `generation`, `review`, `recovery`, `conflict`, `layout`, `regeneration`, `history`, `rewrite`, `rewrite-cancel`, `navigation`, `export`, `shutdown`, `quit`, `performance`, `startup-failure`. 재시작 검사가 필요한 흐름은 실행기가 별도 프로세스로 이어 실행한다.

`shutdown`과 `startup-failure`는 부모가 소유한 실제 앱 ChildProcess의 `exit` 결과가 code 0 / signal null인지 검사한다. 프로세스 소멸만으로 성공 처리하지 않는다. E2E 전용 수명 기록으로 앱 Exit 시 메인 WebView가 유지되고 종료 준비가 완료됐는지도 확인한다. `test:unit`에는 SIGSEGV·비정상 코드·누락 결과를 거부하는 관측기 검사도 포함한다.

`quit`는 임시 문서에 입력하고 800×600/1440×900으로 크기를 바꾼 뒤 24회 종료한다. 네이티브 terminate·창 닫기·실제 앱 종료 메뉴·NSRunningApplication 종료 이벤트를 각각 6회 실행하며 매번 정상 종료 코드·창 수명·원문 보존을 검사한다. PID/실행 경로가 일치하는 테스트 앱만 조작한다. OS 메뉴 검사는 접근성 권한이 필요하며 VoiceOver 점검과는 별개다. 종료 상태 메타데이터는 `.artifacts/quit-stress.jsonl`에 남긴다. 일반 앱의 물리적 Cmd+Q 입력은 별도 확인한다.

`usability`는 세션 초안·후보 변경·조건 저장 실패·실패 요청 수정·적용 전 비교·100개 변경을 검사한다. 창 크기 3개와 `Webview.setZoom(1/1.5/2)` 조합을 측정하며 버튼과 diff 본문 중앙의 실제 hit target도 확인한다. `design`은 영역 치수·배치·본문16px·그룹 선택·모드 왕복을, `design-resume`은 독립 SC07 v13/D03 r2 재시작을 검사한다. 테스트 빌드에만 창 표시·크기·확대 권한을 부여한다. `document.visibilityState`가 hidden이면 검사를 중단한다. 이를 통과나 제품 동작 실패로 오인하지 않는다.

E2E와 일반 앱은 같은 debug 실행 파일을 사용한다. 검사가 끝나면 일반 앱을 복원한다.

`review` 선택 실행은 기존 검토 뒤 `patch-groups`와 별도 프로세스 `patch-groups-restart`를 이어 실행한다. 새 두 단계만 실행하려면 `npm run test:e2e -- patch-groups`를 사용한다. 동일 요청의 다섯 그룹 순환 탐색·일부 거절/승인·남은 전체 승인, 구형 네 변경의 재분류·그룹 ID 보존, 외부 변경 중 전체 승인 취소를 검사한다. 순수 판정은 Rust `patch_group_plan`, 저장·전환·동시성·마이그레이션은 `review`의 `grouping / grouping_safety`, 화면 준비 순서·실패는 `patch-review-read.test.ts`로 검사한다. 실제 실행 결과는 [PATCH 그룹 기록](patch-groups-implementation.md)에서 구분한다.

```sh
npm run native:build
```

WDIO 플러그인·테스트 IPC·장애 주입·개발용 계약 생성기는 제품 번들에서 제외한다. 결과 화면과 로그는 Git에서 제외한 `.artifacts/`에 저장한다.

## 모델 선택 검사

`npm run test:e2e -- model-selection`은 미설치 저장·오류 복구·연결 테스트 무효화·앱 재시작 복원·합성 모델 제한·이전 모델 재시도·새 모델 요청을 검사한다. 1440×900/800×600과 100%/150%/200% 화면은 `.artifacts/models/`에 저장한다.

Rust `model_settings` 및 workflow의 `model_selection`/`model_modes`는 실제 공통 인자 생성기로 가짜 자식 프로세스를 실행하여 네 선택값과 모든 생성 경로의 저장값·실행값을 확인한다. 모델 없는 과거 요청은 CLI 기본값이며, 과거 실행 기록의 NULL은 모델 미상이다. 이 결과는 실제 서비스 모델 권한·품질·응답 지연 검증을 대신하지 않는다. [검증 기록과 미검증 범위](model-selection.md)를 참고한다.

## Codex 검사

`npm run test:e2e -- codex`는 가짜 App Server로 모든 생성 모드·연결·인증/저장 오류·중단·재시도·재시작·늦은 응답 경합을 검사한다. 실제 OS 키보드는 `codex-keyboard`로 별도 선택한다. PID와 실행 경로를 검증한 Swift 검사기가 Tab·방향키·Space·Enter·Escape를 테스트 앱에 전달한다. 이 검사는 macOS 접근성 권한이 필요하다. 1440×900/800×600·100%/150%/200% 설정/확인 캡처는 `.artifacts/codex/`에 둔다. OS select 팝업은 별도 레이어라 앱 캡처에 포함되지 않는다.

`codex`에는 `codex-recovery`도 포함한다. 별도 선택 시 제거된 저장 모델·지원하지 않는 reasoning에서도 목록 조회와 대체 선택이 가능한지, 유실 thread의 수동 재시도가 새 연결에 로컬 대화를 전달하는지 검사한다. Rust workflow의 `codex_recovery`는 계정·작업·공급자 경계, 재시작, 늦은 실패와 DB 롤백을 추가로 검사한다. [보완 계획과 결과](codex-recovery-fixes.md)를 참고한다.

같은 모델의 미지원 추론 수준은 명시적 저장으로 복구하고, 기본값과 달라도 지원되는 저장값은 유지하는지 검사한다. 변경 안내·저장 버튼의 설명 연결과 6개 화면/배율 조합도 확인한다. `codex_session_state`는 연결 없는 새 계정·유실·이전 계정 재선택·다른 작업의 상태를 구분한다. [추가 보완 기록](codex-isolation-settings-fixes.md)을 따른다.

`codex-native`는 명시적으로 선택할 때만 현재 ChatGPT 인증으로 연결 테스트·전 생성 모드·승인/저장·중단·고정 모델 재시도·재시작을 실행한다. 합성 문서와 임시 DB만 사용하지만 실제 사용 한도를 소비한다. 기본 전체 E2E·CI에는 포함하지 않는다.

설치 Codex 계약은 아래 ignored 테스트를 명시적으로 실행한다. `codex_isolation`과 `codex_tools`는 합성 홈·로컬 수신기만 사용하며 계정이 필요 없다. `codex_contract_native`의 생성 사례와 `codex_managed_native`는 현재 계정 사용량을 소비한다. 실행 전 `DOCREVIEW_CODEX_BIN`에 공식 실행 파일의 절대 경로를 지정한다. 버전·도구 제공/부수효과·지침 격리·중단 증거와 한계는 [Codex 실행 기록](codex-integration.md)을 따른다.

```sh
DOCREVIEW_CODEX_BIN=/opt/homebrew/bin/codex cargo test --locked --features test-support --test codex_isolation --test codex_tools --test codex_instructions_native -- --ignored
DOCREVIEW_CODEX_BIN=/opt/homebrew/bin/codex cargo test --locked --features test-support --test codex_contract_native --test codex_managed_native -- --ignored
DOCREVIEW_CODEX_BIN=/opt/homebrew/bin/codex cargo test --locked --no-default-features --features test-support --test codex_missing_native -- --ignored
```

`codex_missing_native`는 빈 임시 홈과 합성 미존재 thread만 사용한다. 실제 계정·인증 파일·생성 턴 없이 설치 버전의 유실 오류 계약을 검증한다.

`codex_instructions_native`는 빈 임시 홈과 로컬 추론 수신기로 새 thread와 예전 지침이 저장된 thread의 재개를 검사한다. model_instructions_file 및 이전 별칭의 외부 표식이 전송되지 않고 앱 소유 기본 지침이 전송되어야 한다. 실제 계정과 외부 추론 서비스는 사용하지 않는다.

위 Cargo 명령은 프로젝트 Rust 도구 환경의 `src-tauri`에서 실행한다. 네이티브 E2E를 시작하기 전에 다시 `native:build:e2e`를 실행한다. Cargo 테스트도 공통 debug 실행 파일을 일반 앱으로 바꿀 수 있다.

## 실제 계정 검사

`src-tauri/tests/connection_native.rs`, `generation_native.rs`, `cli_compatibility_native.rs`, `model_selection_native.rs`, `model_observation_native.rs`의 실제 계정 검사는 기본적으로 ignored다. 사용자 계정과 구독 한도를 사용하므로 자동 CI에 넣지 않는다. 진단 검사는 메타데이터만 출력하고 모델 요청 검사는 합성 문서와 별도 DB에서 수행한다.

CLI 버전별 검사는 `DOCREVIEW_TEST_CLI`에 실행 파일의 절대 경로를 지정한다. 버전 간 재개 검사는 `DOCREVIEW_CURRENT_CLI`에도 현재 실행 파일 경로가 필요하다. 토큰·문서·응답 원문을 로그에 남기지 않는다.

모델별 실계정 검사는 같은 `DOCREVIEW_TEST_CLI`를 사용한다. `src-tauri`에서 `cargo test --locked --test model_selection_native -- --ignored --test-threads=1 --nocapture`로 명시 실행한다. 네 선택값의 PATCH와 재시작 후 Sonnet→Opus 재개를 검사하며 최대 여섯 요청의 사용량이 발생한다. 오류가 발생해도 원문·요청 모델·프로세스 lease와 기존 후보/대화 보존을 확인한다. CLI 실행 전 실패 검사는 기본 자동 테스트에 포함된다. 버전·체크섬·소요 시간과 남은 제한은 [실계정 검증 기록](model-account-validation.md)을 참고한다.

CLI 관측 검사는 같은 환경에서 `cargo test --locked --test model_observation_native -- --ignored --test-threads=1 --nocapture`로 실행한다. 과거 모델의 가용성 오류, 테스트에만 명시한 Haiku fallback, 네 선택값의 사용 메타데이터를 최대 여섯 합성 호출로 검사한다. 원시 응답·오류는 메모리에서만 처리하며 검증한 모델 식별자·출력 토큰 수·정적 상태 정보만 출력한다. 제품의 허용 모델·인자·오류 분류는 변경하지 않는다. 메타데이터 유출·형식·크기·성공 답변 오인 방지 검사는 기본 자동 테스트에 포함된다.

## 검증 범위와 한계

- macOS WebView 자동 문자 삽입은 실제 두벌식 조합 검사가 아니다. 실제 입력기에서 `한` 입력 직후 Backspace로 `하`가 남는지, 이어 쓰기·조합 중 삭제·저장·재시작을 별도로 확인한다.
- 실제 OS 열기·저장·취소·덮어쓰기 창은 일반 앱에서 별도로 확인한다. 테스트 파일 선택 fixture와 DOM 검사가 이를 대신하지 않는다. 요청 흐름 [SPEC의 AC16](../../SPEC.md#7-인수-기준)과 [TODO의 WF-07-10](../../TODO.md)는 실제 VoiceOver·한글 IME 검증을 요구하며 두 항목은 아직 미확인이다. OS 키 자동화나 합성 composition 가드를 그 완료 근거로 대체하지 않는다.
- 2026-10-28 이전 구현의 네이티브 종료·입력 잠금·CLI 종료·재시작 검사는 통과했다. 전체 시나리오별 결과와 중간 실패 수정 근거는 사용성 실행 기록을 따른다.
- macOS 14·M1·8 GB 최소 장치, 개발 도구 없는 새 macOS 사용자 환경, 실제 작성자 사용성 검증은 확인되지 않았다.
- Pro·Max·Enterprise 허용은 합성 인증 계약으로 검사했다. 실제 해당 플랜 계정 검증과 구분한다.
- 개발용 WDIO ZIP 전이 의존성에 알려진 audit 항목이 있다. 현재 embedded 경로는 브라우저 다운로드·ZIP 해제를 사용하지 않는다. `npm audit --omit=dev`와 전체 audit 결과를 구분하고 `npm audit fix --force`를 일괄 적용하지 않는다.

승인·범위·버전·저장 실패의 기대 동작은 [제품 인수 기준](../product/acceptance-criteria.md)을 따른다.

2026-10-28 사용성 개선의 실행 결과·캡처 시점·미검증 항목은 [별도 실행 기록](usability-implementation.md)에 정리한다. 이전 단계 통과 결과와 최신 수정 후 재실행 결과를 구분한다. 시안 이행 재구현은 [새 실행 기록](design-reimplementation.md)을 따른다.

## 디자인 비교 자료 검사

저장소 루트에서 `node --test docs/design/usability-comparison.test.mjs docs/design/reimplementation.test.mjs`를 실행한다. 브라우저 검사는 별도 터미널의 `python3 -m http.server 8766 --bind 127.0.0.1`과 `node docs/design/verify-browser.mjs`를 사용한다. Chrome 임시 프로필은 스크립트가 종료·삭제하며 서버는 확인 후 Ctrl+C로 종료한다. 페이지 검사는 네이티브 제품이나 실제 사용자 평가를 대신하지 않는다.

## 선택 수정 검사

`npm run test:e2e -- ux`는 후보 부분 수정의 성공·잘못된 응답 거부, 지시/인용/다른 제안/확정본 보존, 별도 프로세스 초안 복원과 `ux-extensions`의 확정 문맥·재작성 후보 선택을 실행한다. `ux-local`의 키보드·직접 수정·첫 요청과 긴 인용/지시/모델의 9개 화면 조합도 포함한다. 잘못된 선택 응답의 오류 상태도 같은 9개 조합에서 확인한다. 확장만 실행하려면 `-- ux-extensions`, 로컬 조작만 실행하려면 `-- ux-local`을 사용한다. 화면 잠금으로 visibility가 hidden이면 실패로 종료하며 검사를 우회하지 않는다.

순수 선택/문장·문단/초안 경합 검사는 `test:unit`, Rust는 workflow의 `drafts`, `ux_reads`, `selection_revision`, `selection_extensions`, `selection_extension_failures`를 포함한다. 두 가짜 공급자·고정 문맥 재시도·중복·중단·과거 기준 비교를 확인한다. 최신 결과와 미검증 항목은 [UX 개선 현재 상태](ux-status.md)에 구분한다. 캡처 1~9와 전환 보완 화면은 [실제 앱 화면](../usage/ux/README.md)에 정리한다.

`ux-native`는 별도의 `DocReview UX.app`과 임시 DB를 만들고 실제 키보드/VoiceOver 확인 신호를 기다리는 수동 선택 실행이다. 기본 전체 회귀에는 포함하지 않는다. 조합 이벤트나 실제 VoiceOver 검증 기록이 없으면 통과시키지 않는다. [수동 인수 절차와 이번 시도의 제한](ux-native-validation.md)을 따른다.

`selection-popover`는 diff 행동/정확한 코멘트, 원문 부분 요청의 성공·실패·기존 제안 보존, 다른 작업의 겹침 이동, 첫 작업·중복 생성 방지, 원문 변경 차단, 팝오버 9개 창/배율 조합과 별도 프로세스 초안 복원을 검사한다. embedded 드라이버의 합성 키 이벤트는 HTML 버튼의 OS Enter 기본 동작이나 실제 IME 검사가 아니다.

`selection-transitions`는 A 수정 중 B 탐색 뒤 정확한 결과·승인 그룹 복귀, 원문/diff 활성 초안 분리, 보기 왕복의 팝오버 취소와 우클릭 메뉴 제어를 검사한다. 별도 재실행으로 두 화면의 대상 ID·revision·지시 보존과 자동 전송 부재를 확인한다. 숨은 다른 viewer의 팝오버와 구분해 원문 도구를 검사하며 네이티브 기본 메뉴는 일반 release의 OS 우클릭으로 별도 확인한다. [보완 기록](selection-transition-fixes.md)을 따른다.

`source-lifecycle`는 원문 요청 중 보기 왕복의 실행 잠금·성공 이동·실패 오류와 지시 보존, 작업 A/B 전환의 초안 보존·임시 선택 해제와 이전 요청의 늦은 성공을 검사한다. 가짜 응답을 지연해 실제 RUNNING 상태에서 전환하고 확정 파일·버전 보존도 확인한다. [원문 요청 수명 보완](source-request-lifecycle-fixes.md)을 따른다.

일반 release는 `--verification-workspace <전용 임시 폴더>`에서 합성 DB만 연다. 전용 이름·소유자·0700·고정 마커·심볼릭 링크를 검증하며 잘못된 인자에는 사용자 DB로 폴백하지 않는다. `verification-fixture.mjs`는 소유한 E2E 데이터만 백업하고 문서의 canonical 경로를 새 임시 폴더로 바꾼다. 일반 release에는 가짜 공급자·테스트 IPC를 포함하지 않는다. 빌드 ID·시각·프로필과 실행 파일 해시는 `.artifacts/build-*.json`에 기록하며 빌드 중 제품 소스가 바뀌면 증명을 발급하지 않는다.

`npm run test:e2e -- ux-reliability`는 실패한 일반 요청의 종류·지시 복원, 종류별 초안 충돌 선택, 첫 확인 취소, 승인 후 원문 선택 고정과 문서 왕복을 검사한다. 별도 재실행으로 손상 초안 격리·정상 초안 저장·원본 확인·명시적 초기화·입력 재개도 검증한다. 복구 버튼은 3개 창 × 3개 배율에서 hit target·넘침을 확인한다. 단위 검사는 초기화 CAS 실패·중복·늦은 입력·알 수 없는 오류 전파와 E2E 실행 차단을 포함한다. [보완 기록](draft-reliability.md)을 따른다.

## 재작성 변경별 검토 검사

다음 명령은 순서대로 실행하며 빌드·Cargo·네이티브 E2E를 병렬로 실행하지 않는다. `rewrite-review`는 main 종료 후 같은 소유 임시 DB를 별도 프로세스의 restart 단계로 이어 간다.

```sh
npm run native:build:e2e
npm run test:e2e -- rewrite-review
npm run test:e2e -- rewrite-review-keyboard
npm run test:e2e -- review-followup
```

`rewrite-review`의 대상은 실제 REWRITE 생성→로컬 계획 시작→단위 의견→도입부 승인/수치 거절→등록 실패와 초안 보관 구분→별도 프로세스 재개→거절 재검토→남은 승인→확정본 사본 내보내기다. 빈 필터·필터 밖 선택·의견 작성 중 필터 왕복, 현재/원래 시각·텍스트 기준, 원래 조회 로딩/실패/재시도·성공 캐시·늦은 응답을 함께 검사한다. 조회 장애는 테스트 transport 경계에서 주입하며 원문·결정·등록 내용을 바꾸지 않는다. 새 전체 요청과 일괄 승인 확인 중 외부 수정도 대상이다.

화면은 800×600·1280×800·1440×900 × 100%·150%·200%의 본문·코멘트·오류·처리 기록을 측정한다. 초기 viewport와 명시적인 선택 위치 이동·본문 스크롤·패널 왕복·팝업 열기를 구분해 기록한다. 버튼 hit target만으로 읽기 공간을 판정하지 않고 삭제/추가·선택 번호·결정의 동시 가시성, 본문 실제 텍스트 영역·좌측 표식·포커스 가림·스크롤 복원을 확인한다. 긴 제목과 결합 범위는 별도 합성 `layout` 문서를 기존 생성 모드로 요청하고 실제 계획의 제목·복수 operation·모든 관련 위치를 검사한다. 읽기 왕복 후 원문·결정·등록 의견 불변과 원래 main 문서·작업·초안 복귀를 확인한다.

측정 전에는 native 창 표시와 `document.visibilityState=visible`을 요구하고 native·문서 포커스도 기록한다. 가려졌으면 검증한 PID·실행 경로의 테스트 창을 한 번 실제로 표시·전면 복원하고 제한 시간 안에 다시 확인한다. 프레임 대기도 제한하며 숨김·프레임 정지·WebDriver 응답 지연을 통과로 처리하지 않는다. 검사 전제 실패와 제품 계약 실패를 구분한다. 실제 키 전송은 별도로 전면 앱을 엄격히 검증한다. 최신 캡처·측정·빌드 출처는 `.artifacts/unit-review/after/`, 이전 단계 자료는 `.artifacts/unit-review/`에 구분한다.

Rust `rewrite_plan`, `unit_review`, `unit_review_edges`, `unit_review_guards`, `unit_review_migration`, `unit_review_races`, `unit_comments`는 바이트 보존·구조 결합·동시성·이관·저널 복구·불변 후보·의견 대상/CAS를 검사한다. 프런트엔드 단위 검사는 공통 필터·선택 정리·순환·재검토 회차, 시각/텍스트의 동일 hunks·행 marker·실제 기준 버전, 빈 행·HTML 텍스트·페이지 clamp, key별 보관 응답과 현재 입력의 동일성, 다른 key 실패·복원/잠금·중복 재시도·늦은 응답을 다룬다.

`rewrite-review-keyboard`는 접근성 권한·PID·실행 경로·전면 앱을 확인한 Swift 검사기로 macOS Tab·Enter·Esc·F7/Shift+F7·반복 Enter/Space를 전달하는 자동 검사다. 반복키는 비결정 제목에서 freshdown을 시작하고 실제 hold를 유지한 채 결정 버튼으로 포커스를 옮겨 repeatdown·keyup을 받으며 trusted 순서·대상을 확인한다. finally에서 같은 PID의 키를 해제한다. 필터 안 탐색·빈 목록·줄바꿈·초안 보존·복귀·결정 수·제목/완료 포커스를 검사하며 기본 전체 실행에는 포함하지 않는다. `CompositionEvent`와 `isComposing`을 주입하는 사례는 **합성 Escape 가드 검사**로 표시한다. trusted OS 키 이벤트도 실제 한글 입력기 조합이나 VoiceOver 발화를 검증한 것은 아니다.

`review-followup`은 일부 승인 후 current/original의 실제 scrollTop·첫 가시 행·포커스 보존, 800×600/200%의 승인 IPC 실패와 외부 파일 충돌 안내의 실제 bounds/hit, 60행 초과 계획에서 선택·관련 위치의 텍스트 페이지/행 이동과 수동 이탈·복귀를 검사한다. 외부 충돌은 기존 계약의 미처리 STALE 전이와 외부 파일 변경을 기대하고 문서 head·결정·회차·의견은 보존한다. 단위 행 부재 안내와 숨은 텍스트의 지연 이동은 단위 회귀에서 확인한다.

공유 비교·초안 경계 변경 뒤에는 `review`, `rewrite`, `history`, `recovery` 및 변경한 선택 수정 경로의 관련 회귀를 실행한다. 마지막에는 `npm run native:build`로 일반 앱을 복원하고 소스/바이너리 출처와 테스트 기능 제외를 확인한다. 이번 실행 결과·범위·남은 수동 확인은 [변경 검토 실행 기록](review-ux-implementation.md), 이전 단계는 [기존 구현 기록](rewrite-unit-review.md)을 따른다. 이 문서의 검사 목록은 최신 빌드의 성공 결과를 대신하지 않는다.

## 요청·검토 흐름 검사

`npm run test:e2e -- request-followup`은 진입점별 모드 지시, 실제 설정 저장에 따른 재제안 확인 무효화·조회 시 유지·최신 모델 전송, 원문/후보 클릭 취소와 정확한 초안 이어쓰기, 초안 저장 실패 시 닫기 거부를 검사한다. `request-workflow`에는 접힌/열린 조건보다 이번 요청에 실제 키 입력이 가는 포커스 회귀를 추가했다. 관련 단위 회귀는 `regeneration-invalidation/selection-dismiss/selected-dismiss/request-labels`다. 최신 보완 상태는 [보완 기록](request-workflow-followup.md)을 따른다.

`npm run test:e2e -- request-workflow`는 최초 목적·방식 전환·목표 없는 확인/취소·작업 하나 유지, 첫 초안 보관 실패와 별도 프로세스 재시작, PATCH/WHOLE/단위 변경 질문과 무변경, 후보 수정 진입과 CHANGES의 원문 재선택을 검사한다. 실제 Tauri·임시 DB·가짜 공급자를 사용한다. 생성 전 초안은 문서/임시 작업별, 요청 대상별 초안은 기존 작업 키로 보관한다.

변경 질문에는 잘못된 응답·중단 직후 늦은 출력·재시도와 답변에서 정확한 원래 단위로 돌아가는 검사를 포함한다. `rewrite-review`는 긴 본문 스크롤과 별도로 짧은 제목 변경의 삭제·추가 전체 읽기와 결정 버튼 hit를 9개 조합에서 검사한다. 같은 소스의 [최신 화면·측정 출처](../usage/request-workflow/README.md)를 참고한다.

`test:unit`의 first-request/selected-first-preparation/request-targets/request-validity/change-question-request는 인계 실패·늦은 입력·준비 CAS·이전 폴링 무시·정확한 질문 IPC를 검사한다. Rust workflow_tasks/workflow_migration/workflow_questions는 이름/목표·스키마 12 이관/롤백·구형 데이터·소유권·변조·두 실제 가짜 자식 공급자에 전달한 질문과 문서/결정 불변을 확인한다. 검토/선택/복원/내보내기 회귀와 마지막 일반 빌드 복원을 함께 수행한다.

generation-submit-lock은 초안 flush 중 검토 잠금·전송 실패 후 해제·작성기 소유자 교체 시 미전송을 확인한다. source-first-conditions/source-request-close는 첫 원문 요청의 조건 저장과 닫기 실패 보존을 검사한다. 네이티브 화면 검사는 지정 창을 배치하고 검증한 앱의 실제 활성화 뒤 최대 5초 안에 visible을 요구한다. 두 프레임은 별도 1초 제한으로 확인하며 표시 실패를 통과로 바꾸지 않는다.

실제 초보 작성자 3명의 과업과 한국어 입력기·VoiceOver는 AC15/16에 별도로 기록한다. 이 문서의 검사 목록은 통과 증거가 아니며 [요청 흐름 실행 기록](request-workflow-implementation.md)에서 최신 실행과 남은 확인을 본다.

보완 격자는 전체 창 크기를 기준으로 실제 `actualWindow`와 CSS viewport를 함께 기록한다. 2026-11-05 실행에서 사용자가 현재 화면에서 가능한 검사만 진행하도록 지정하여 큰 창은 1440×892로 제한됐다. 가림·넘침·저장/승인 기대값은 유지하며, 정확한 1440×900의 미확인을 통과로 바꾸지 않는다.
