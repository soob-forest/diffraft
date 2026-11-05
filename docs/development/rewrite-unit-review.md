# 전체 재작성 변경별 검토 구현 기록

기준: [SPEC](../../SPEC.md), [TODO](../../TODO.md) · 시작일: 2026-11-03 · 상태: 구현·자동 검증 완료 · 수동 접근성 확인 대기

## 변경 전과 영향

시작 시 사용자 변경은 SPEC.md와 TODO.md였다. 기존 생성 모드와 AI 출력 스키마를 보존하면서 재작성의 검토 방식·로컬 계획·단위 의견을 추가한다. 파일 저장은 기존 저장 저널을 사용하고, 기존 PATCH 인용 코멘트는 유지한다.

영향도: 표시 hunk를 승인 대상으로 삼지 않고 불변 편집 연산에서 단위를 만든다. 재검토는 과거 REJECTED revision을 보존하므로 활성 조회는 단위의 현재 회차만 포함해야 한다. 전체 적용·후보 수정 명령은 검토 방식으로 추가 검증한다.

## ADR-REWRITE-007: 결정적 분해 계산

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 표시용 행 diff와 시간 제한 결과 재사용 | 기존 계산을 사용한다. | 문맥/시간 제한에 따라 승인 경계가 달라지고 문단 구조가 반영되지 않는다. | 제외 |
| 원문 블록 토큰의 LCS와 작업량 한도 | 원문 바이트와 문단 경계를 보존하고 결과가 결정적이다. | 블록 수가 많으면 큰 승인 단위로 처리해야 한다. | 채택 |

알고리즘 버전 1은 원문 블록 사이 공백을 원문 범위에 포함하며 재직렬화하지 않는다. 블록 수 곱 65,536 또는 기존 256개 편집 연산 상한 초과 시 전체 후보를 한 단위로 검증한다. 원문/후보의 Unicode·줄바꿈을 정규화하지 않는다. 명확한 동일 문단 이동·명시적 참조·제목 구조만 연결하고 의미 의존성을 추정하지 않는다.

## ADR-REWRITE-008: 네이티브 연속 클릭 보호

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| click.detail과 버튼 disabled만 사용 | 구현이 작다. | WKWebView는 저장 잠금·대상 갱신 뒤 두 번째 클릭을 detail=1로 보내 다음 단위를 승인할 수 있다. | 제외 |
| 결정 버튼에서 시작한 같은 위치의 빠른 클릭 보호 | 저장 중 inert로 대상이 바뀌어도 중복 결정과 기본 포커스 이동을 막는다. | 같은 위치를 500ms 안에 다시 누르는 의도적 조작도 한 번으로 처리한다. | 채택 |

첫 결정 mousedown의 위치·시각만 보관하고 500ms/4px 이내 반복을 캡처 단계에서 막는다. 다른 위치의 클릭·새 키보드 입력에는 적용하지 않는다. DOM의 원문·의견은 기록하지 않는다. 100ms 간격 두 실제 포인터 클릭으로 기존 중복 승인을 먼저 재현한 뒤 회귀 검사한다.

## 실행 결과

- 기준 프런트엔드: Vitest 54개 파일·169개 테스트 통과. 추가 Node 검사도 통과.
- 기준 Rust: 전체 기본 native:test 종료 코드 0, 실패 없음. 실제 계정 ignored 검사는 실행하지 않았다.
- 분해 테스트 최초 실행: 6개 중 4개 실패를 확인했다. 인접 문단 독립성·부분 조합·이동·잘못된 입력 거부가 실패했다.
- 분해 구현 후: rewrite_plan 8개 테스트 통과. 문단·표·목록·코드·인용·이동·Unicode/BOM/혼합 줄바꿈·빈 문서·전체 삭제·작업량 한도를 검사했다.

## 구현 경로와 태스크 증거

| 태스크 | 구현·검증 |
| --- | --- |
| T0 | 기존 스키마10·PATCH 그룹 결정·WHOLE 후보 적용 경로와 사용자 문서 변경을 확인했다. Node 24.22.1·로컬 Rust 도구, macOS Tauri/WKWebView에서 검사했다. |
| T1-01~06 | `document/rewrite_plan.rs`, `rewrite_blocks.rs`, `rewrite_groups.rs`. 8개 순수 테스트가 작은 조합 전수·120개 문단의 고정 seed 40조합·65536 작업 한도·Unicode/혼합 줄바꿈을 검사한다. |
| T2-01~06 | `domain/unit_review.rs`, migration011, `storage/unit_review_{start,records,queries,state}.rs`, review IPC·생성 계약. 동시 시작·부분 등록 실패 롤백·10→11 보존/백업/실패·기존1~9 이관을 검사했다. |
| T3-01~08 | 기존 저널·그룹 결정에 현재 회차 조회를 연결했다. `unit_review_original`, `unit_review_reopen`, 전체 적용/직접 수정/선택 수정/재제안 가드와 집계를 연결했다. 새 요청 실패 보존·성공 후 보관, 같은 head 승인 경합, 새 회차의5단계 저장 중단 복구를 검사했다. |
| T4-01~05 | `storage/unit_comments.rs`, 공유 task_context, 단위별 초안. 삭제 단위·다중 의견·같은 ID 재시도·다른 대상·크기/NUL·상태 CAS·취소 경합·후속 요청의 의견/대상 전달을 검사했다. |
| T5 | UnitReview·Tools·Navigation·Diff·Comments와 전용 controller/hook. 기존 Operate 화면을 확장했다. 시작/현재 비교/원래 후보/부분 결정/재검토/등록 의견/초안/오류/기록/완료를 구분한다. |
| T6 | `rewrite-review`/`rewrite-review-restart`/`rewrite-review-keyboard` 선택 실행을 등록했다. 신규 성공/실패/재시작5개와 실제 키보드1개, 기존 review6개·rewrite7개·recovery2개가 순차 통과했다. 일반 빌드 증명은 아래 기록을 따른다. |

사전/사후 조건: 생성 mode·job/batch ID는 유지한다. WHOLE→CHANGES는 고정 계획을 원자적으로 만들며 파일을 쓰지 않는다. 결정은 현재 회차의 구성원 전체와 head/파일을 확인하고, 의견은 불변 단위에만 연결한다.

## 실패를 먼저 확인한 회귀

- projection이 거절 후에도 전체 후보를 표시하고 전체 적용 API로 우회하던2개 실패를 확인한 뒤 검토 방식 분기·서버 가드를 수정했다.
- UI에서 CHANGES 완료가 영구 전체 후보로 보이고 원문 겹침 검사에서 빠지는2개 실패를 먼저 확인한 뒤 presentation·원문 선택·새 요청의 분기를 수정했다.
- 첫 E2E에서 잘못 작성한 복합 텍스트 선택자가 실패했다. WDIO의 부모/자식 선택 방식으로 고친 뒤 실제 도입부 승인·수치 거절·재실행·내보내기5개 사례가 통과했다. 제품 실패와 검사 코드 오류를 구분한다.

- 최종 화면 검사에서 이전 코멘트 진입 요청이 다음 단위 입력에 포커스를 주는 회귀를 확인했다. 진입 의도를 단위 ID에 고정하고 한 번 소비하도록 수정했다. 자동 diff 이동은 포커스를 가져오지 않게 했으며 두 번째 mousedown과 누른 채 반복되는 Enter/Space도 차단한다. 개별·일괄 승인 모두 완료 이벤트와 새 projection을 확인하고 저장 잠금·확인창이 해제된 뒤에만 포커스를 옮긴다. 제목/완료 메시지 포커스·반복 결정 회귀로 검사한다.

- 재검토 안내가 이후 거절/승인 저장 결과를 가리는 회귀를 E2E로 먼저 확인했다. 재검토와 결정의 피드백 경로를 통합한 뒤 `거절 완료`와 `v16 저장됨`을 모두 검사했다.
- 화면 검사에서 창 크기 변경 뒤 hidden 상태를 감지해 실패했다. 각 크기/배율 적용 뒤 창 표시·전면 요청과 실제 visible 상태를 확인하도록 검사 준비를 보완했다. hidden 상태를 통과로 바꾸지 않았다.

## 최종 자동 검사

- `typecheck`, `lint`, `native:fmt`, `native:check`, `contracts:check`, `build`: 통과. Rust clippy 경고를 오류로 검사했다.
- `test:unit`: **55개 파일·176개 테스트 통과**. 기존54개 파일169개에서 단위 검토 회귀를 추가했다. Node의 프로세스 종료·빌드 증명·전용 fixture9개 검사도 통과했다.
- `native:test`: 47개 suite, **361 passed / 0 failed / 30 ignored**. 실제 계정/설치 CLI의 명시 실행 검사는 실행하지 않았다.
- 네이티브 E2E: `rewrite-review` 5개, `rewrite-review-keyboard` 1개, `review` 6개, `rewrite` 7개, `recovery` 2개, **총21개 통과**. 실제 앱 종료·재시작과 파일/DB 결과를 확인했다.
- 실제 사용자 DB·AI 계정은 사용하지 않았다. 합성 문서·소유한 비공개 임시 DB·가짜 공급자만 사용했다.

## 실제 화면·접근성의 범위

창800×600/1280×800/1440×900과 WebView 확대100/150/200%에서 비교·의견·오류·처리 기록36개 화면을 검사했다. 높이가 부족하면 기존 세로 스크롤과 상세 패널 왕복을 사용한다. 비교·의견 작성·오류·처리 기록의 캡처와 버튼 hit target을 구분해 확인한다. 캡처는 `apps/desktop/.artifacts/unit-review/`에 저장하며 Git에 포함하지 않는다.

실제 OS 키보드는 PID·실행 경로·접근성 권한을 검증하는 기존 Swift 검사기에 F7을 추가해 별도 실행한다. DOM/가짜 키보드를 실제 키보드로 기재하지 않는다. VoiceOver의 실제 발화·한국어 IME 조합 검사는 이번 자동 실행으로 확인하지 않았으며 완료로 표시하지 않는다.


## 인수 기준 추적과 제한

| 기준 | 실행 증거 |
| --- | --- |
| RW01–RW05 | rewrite_plan8개: 문단 독립·구조 원자성·이동·전체 재구성·조합. unit_review의 부분 저장·다음 저장과 unit_review_guards의 그룹 일부 거부. |
| RW06 | unit_review의 전체 적용/이전 안 선택 우회 거부, 부분 결정 후 projection, 실제 E2E의 수치 거절→남은 승인. |
| RW07–RW09 | unit_comments3개, unit_review의 재검토 의견 보존, E2E의 의견 저장·실패 초안·별도 프로세스 복원. 기존 세션 초안의 늦은 응답 CAS 테스트도 실행했다. |
| RW10–RW12 | unit_review_edges6개·races2개·migration2개·guards2개, 전체 기존review/workflow의 동시 저장·SIGKILL·직접/외부 편집·복원·생성 잠금·구형 이관 회귀. |
| RW13–RW14 | unit-review.test.ts의 완료/집계·범위검사, Rust unchanged와 Unicode/BOM/CRLF/CR/LF·삭제·HTML·반복·한도 fixture, 기존 내보내기 회귀. |
| RW15–RW16 | 신규 재실행 성공/실패5개·실제 키보드1개, 기존review6개/rewrite7개/recovery2개를 순차 실행해21개 모두 통과했다. |
| RW17–RW20 | E2E에서 주요/보조 행동·단위 의견·원래 후보 왕복·36개 창/배율/상태 캡처·버튼 hit target·제목 포커스를 검사했다. |
| RW21 | unit_review·races의 새 회차/멱등성/CAS/과거 거절 보존·저장 복구, 실제 재실행 뒤 같은 단위 다시 검토와 결정. |
| RW22 | 창3×배율3의 DOM·hit target, 실제 macOS Enter/Esc/F7/반복 Enter 검사. VoiceOver 발화·한국어 IME 조합은 수동 확인 대기다. |

OS 키보드 첫 시도는 앱 활성화150ms 고정 대기에서 전면 앱 조건이 충족되지 않아 실패했다. 검증한 PID의 [AXFrontmost 속성](https://developer.apple.com/documentation/applicationservices/kaxfrontmostattribute)을 설정하고 전면 상태가 될 때까지 최대1초 기다린 뒤 검사했다. deprecated 옵션 없이 최종 키보드1개가 통과했다. PID·실행 경로·접근성 권한·전면 상태 검증을 유지했다.

검증 로그: `/tmp/docreview-unit-final.log`, `/tmp/docreview-native-test-final.log`, `/tmp/docreview-native-check.log`, `/tmp/docreview-contracts-check.log`, `/tmp/docreview-e2e-*-verified.log`. 화면·빌드 메타데이터는 Git에서 제외한 `.artifacts/`에 둔다. 실제 테스트 원본은 `apps/desktop/tests/rewrite-review*.e2e.mjs`와 관련 Rust 테스트다.

일반 앱 복원: `npm run native:build` 통과. `.artifacts/build-debug.json`의 ID `ab649167843e1016-debug`, SHA-256 `dab4a99c480d3e0c64799bd25143dbac3888bf58098e4c2c93db93f6e1eea800`이 실제 실행 파일·일반 빌드 증명과 일치한다. 현재 제품 소스 해시도 일치하며 테스트 IPC·E2E 환경 경로·WDIO 표시가 바이너리에 없음을 확인했다. 빌드 로그는 `/tmp/docreview-normal-build-final.log`다. TODO43개 중42개 완료이며 T6-03의 실제 VoiceOver 발화·한글 IME 조합은 수동 확인 대기로 남긴다.
