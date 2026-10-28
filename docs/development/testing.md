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
```

선택 실행: `connection`, `generation`, `review`, `recovery`, `conflict`, `layout`, `regeneration`, `history`, `rewrite`, `rewrite-cancel`, `navigation`, `export`, `shutdown`, `performance`, `startup-failure`. 재시작 검사가 필요한 흐름은 실행기가 별도 프로세스로 이어 실행한다.

E2E와 일반 앱은 같은 debug 실행 파일을 사용한다. 검사가 끝나면 일반 앱을 복원한다.

```sh
npm run native:build
```

WDIO 플러그인·테스트 IPC·장애 주입·개발용 계약 생성기는 제품 번들에서 제외한다. 결과 화면과 로그는 Git에서 제외한 `.artifacts/`에 저장한다.

## 실제 계정 검사

`src-tauri/tests/connection_native.rs`, `generation_native.rs`, `cli_compatibility_native.rs`의 실제 계정 검사는 기본적으로 ignored다. 사용자 계정과 구독 한도를 사용하므로 자동 CI에 넣지 않는다. 진단 검사는 메타데이터만 출력하고 모델 요청 검사는 합성 문서와 별도 DB에서 수행한다.

CLI 버전별 검사는 `DOCREVIEW_TEST_CLI`에 실행 파일의 절대 경로를 지정한다. 버전 간 재개 검사는 `DOCREVIEW_CURRENT_CLI`에도 현재 실행 파일 경로가 필요하다. 토큰·문서·응답 원문을 로그에 남기지 않는다.

## 검증 범위와 한계

- macOS WebView 자동 문자 삽입은 실제 두벌식 조합 검사가 아니다. 실제 입력기에서 `한` 입력 직후 Backspace로 `하`가 남는지, 이어 쓰기·조합 중 삭제·저장·재시작을 별도로 확인한다.
- 실제 OS 열기·저장·취소·덮어쓰기 창과 VoiceOver도 일반 앱에서 확인해야 한다. 테스트 파일 선택 fixture와 DOM 검사가 이를 대신하지 않는다.
- 현재 네이티브 종료 입력 잠금 검사는 이벤트 대기를 보완한 뒤 최신 재검증이 완료되지 않았다. 전체 네이티브 검증 완료로 간주하지 않는다.
- macOS 14·M1·8 GB 최소 장치, 개발 도구 없는 새 macOS 사용자 환경, 실제 작성자 사용성 검증은 확인되지 않았다.
- Pro·Max·Enterprise 허용은 합성 인증 계약으로 검사했다. 실제 해당 플랜 계정 검증과 구분한다.
- 개발용 WDIO ZIP 전이 의존성에 알려진 audit 항목이 있다. 현재 embedded 경로는 브라우저 다운로드·ZIP 해제를 사용하지 않는다. `npm audit --omit=dev`와 전체 audit 결과를 구분하고 `npm audit fix --force`를 일괄 적용하지 않는다.

승인·범위·버전·저장 실패의 기대 동작은 [제품 인수 기준](../product/acceptance-criteria.md)을 따른다.
