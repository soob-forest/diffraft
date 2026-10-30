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

특정 흐름만 검사하려면 다음처럼 실행한다.

```sh
npm run test:e2e -- connection
npm run test:e2e -- shutdown
npm run test:e2e -- quit
```

선택 실행: `tobe`, `design`, `design-resume`, `usability`, `connection`, `model-selection`, `generation`, `review`, `recovery`, `conflict`, `layout`, `regeneration`, `history`, `rewrite`, `rewrite-cancel`, `navigation`, `export`, `shutdown`, `quit`, `performance`, `startup-failure`. 재시작 검사가 필요한 흐름은 실행기가 별도 프로세스로 이어 실행한다.

`shutdown`과 `startup-failure`는 부모가 소유한 실제 앱 ChildProcess의 `exit` 결과가 code 0 / signal null인지 검사한다. 프로세스 소멸만으로 성공 처리하지 않는다. E2E 전용 수명 기록으로 앱 Exit 시 메인 WebView가 유지되고 종료 준비가 완료됐는지도 확인한다. `test:unit`에는 SIGSEGV·비정상 코드·누락 결과를 거부하는 관측기 검사도 포함한다.

`quit`는 임시 문서에 입력하고 800×600/1440×900으로 크기를 바꾼 뒤 24회 종료한다. 네이티브 terminate·창 닫기·실제 앱 종료 메뉴·NSRunningApplication 종료 이벤트를 각각 6회 실행하며 매번 정상 종료 코드·창 수명·원문 보존을 검사한다. PID/실행 경로가 일치하는 테스트 앱만 조작한다. OS 메뉴 검사는 접근성 권한이 필요하며 VoiceOver 점검과는 별개다. 종료 상태 메타데이터는 `.artifacts/quit-stress.jsonl`에 남긴다. 일반 앱의 물리적 Cmd+Q 입력은 별도 확인한다.

`usability`는 세션 초안·후보 변경·조건 저장 실패·실패 요청 수정·적용 전 비교·100개 변경을 검사한다. 창 크기 3개와 `Webview.setZoom(1/1.5/2)` 조합을 측정하며 버튼과 diff 본문 중앙의 실제 hit target도 확인한다. `design`은 영역 치수·배치·본문16px·그룹 선택·모드 왕복을, `design-resume`은 독립 SC07 v13/D03 r2 재시작을 검사한다. 테스트 빌드에만 창 표시·크기·확대 권한을 부여한다. `document.visibilityState`가 hidden이면 검사를 중단한다. 이를 통과나 제품 동작 실패로 오인하지 않는다.

E2E와 일반 앱은 같은 debug 실행 파일을 사용한다. 검사가 끝나면 일반 앱을 복원한다.

```sh
npm run native:build
```

WDIO 플러그인·테스트 IPC·장애 주입·개발용 계약 생성기는 제품 번들에서 제외한다. 결과 화면과 로그는 Git에서 제외한 `.artifacts/`에 저장한다.

## 모델 선택 검사

`npm run test:e2e -- model-selection`은 미설치 저장·오류 복구·연결 테스트 무효화·앱 재시작 복원·합성 모델 제한·이전 모델 재시도·새 모델 요청을 검사한다. 1440×900/800×600과 100%/150%/200% 화면은 `.artifacts/models/`에 저장한다.

Rust `model_settings` 및 workflow의 `model_selection`/`model_modes`는 실제 공통 인자 생성기로 가짜 자식 프로세스를 실행하여 네 선택값과 모든 생성 경로의 저장값·실행값을 확인한다. 모델 없는 과거 요청은 CLI 기본값이며, 과거 실행 기록의 NULL은 모델 미상이다. 이 결과는 실제 서비스 모델 권한·품질·응답 지연 검증을 대신하지 않는다. [검증 기록과 미검증 범위](model-selection.md)를 참고한다.

## 실제 계정 검사

`src-tauri/tests/connection_native.rs`, `generation_native.rs`, `cli_compatibility_native.rs`의 실제 계정 검사는 기본적으로 ignored다. 사용자 계정과 구독 한도를 사용하므로 자동 CI에 넣지 않는다. 진단 검사는 메타데이터만 출력하고 모델 요청 검사는 합성 문서와 별도 DB에서 수행한다.

CLI 버전별 검사는 `DOCREVIEW_TEST_CLI`에 실행 파일의 절대 경로를 지정한다. 버전 간 재개 검사는 `DOCREVIEW_CURRENT_CLI`에도 현재 실행 파일 경로가 필요하다. 토큰·문서·응답 원문을 로그에 남기지 않는다.

## 검증 범위와 한계

- macOS WebView 자동 문자 삽입은 실제 두벌식 조합 검사가 아니다. 실제 입력기에서 `한` 입력 직후 Backspace로 `하`가 남는지, 이어 쓰기·조합 중 삭제·저장·재시작을 별도로 확인한다.
- 실제 OS 열기·저장·취소·덮어쓰기 창은 일반 앱에서 별도로 확인한다. 테스트 파일 선택 fixture와 DOM 검사가 이를 대신하지 않는다. VoiceOver는 사용자 요청에 따라 이번 사용성 개선 범위에서 제외한다.
- 2026-10-28 이전 구현의 네이티브 종료·입력 잠금·CLI 종료·재시작 검사는 통과했다. 전체 시나리오별 결과와 중간 실패 수정 근거는 사용성 실행 기록을 따른다.
- macOS 14·M1·8 GB 최소 장치, 개발 도구 없는 새 macOS 사용자 환경, 실제 작성자 사용성 검증은 확인되지 않았다.
- Pro·Max·Enterprise 허용은 합성 인증 계약으로 검사했다. 실제 해당 플랜 계정 검증과 구분한다.
- 개발용 WDIO ZIP 전이 의존성에 알려진 audit 항목이 있다. 현재 embedded 경로는 브라우저 다운로드·ZIP 해제를 사용하지 않는다. `npm audit --omit=dev`와 전체 audit 결과를 구분하고 `npm audit fix --force`를 일괄 적용하지 않는다.

승인·범위·버전·저장 실패의 기대 동작은 [제품 인수 기준](../product/acceptance-criteria.md)을 따른다.

2026-10-28 사용성 개선의 실행 결과·캡처 시점·미검증 항목은 [별도 실행 기록](usability-implementation.md)에 정리한다. 이전 단계 통과 결과와 최신 수정 후 재실행 결과를 구분한다. 시안 이행 재구현은 [새 실행 기록](design-reimplementation.md)을 따른다.

## 디자인 비교 자료 검사

저장소 루트에서 `node --test docs/design/usability-comparison.test.mjs docs/design/reimplementation.test.mjs`를 실행한다. 브라우저 검사는 별도 터미널의 `python3 -m http.server 8766 --bind 127.0.0.1`과 `node docs/design/verify-browser.mjs`를 사용한다. Chrome 임시 프로필은 스크립트가 종료·삭제하며 서버는 확인 후 Ctrl+C로 종료한다. 페이지 검사는 네이티브 제품이나 실제 사용자 평가를 대신하지 않는다.
