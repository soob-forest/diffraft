# 요청 경계 결함 보완

2026-11-05 · WF-12 · 최초 3건과 검증 중 발견한 1건 수정·자동 검증·최신 설치 완료 / 기존 수동 인수 대기. 근거: [추가 검토](request-workflow-critical-review.md).

## Problem 1-Pager

- 배경: 본문 클릭 취소와 모델·조건 변경 시 확인 무효화가 구현돼 있다.
- 문제: 작업 생성 전 취소가 잘못된 초안 키를 저장하고, 확인 준비 중 변경은 늦은 응답에 덮인다.
- 목표: 최초 취소 뒤 다른 초안 저장·정상 종료가 가능하며, 준비 도중 설정이 바뀌면 지시·대상을 보존하고 다시 확인하게 한다.
- 비목표: 저장 큐·소유권·스키마 재설계, 이미 전송한 요청 변경, 시각 디자인 변경.
- 제약: 전체 파일·호출 경로 확인, 실패 선행 회귀, 기존 CAS·수명·전송 고정 계약 유지. 네이티브 빌드와 실행은 순차 진행한다.

## ADR-WF-021~023 · 대안과 영향

| 결정 | 대안 A: 장점 / 단점·위험 | 대안 B: 장점 / 단점·위험 | 선택 |
| --- | --- | --- | --- |
| 021 최초 취소 | 빈 작업 ID 저장 허용: 호출자 단순 / 소유권 계약 약화 | target 없는 닫기는 저장 완료만 기다림: 작음 / 최초 요청 회귀 필요 | B. 최초 입력은 first-request가 보관한다는 기존 계약 사용 |
| 022 일반 준비 | 준비 중 설정 창 차단: 순서 단순 / 설정 접근 제약·조건 경로 누락 | 준비 revision 검사: 작은 경계 보완 / 모든 await 뒤 확인 필요 | B. 변경 이벤트마다 revision 증가, 확인 게시 직전 비교 |
| 023 선택 준비 | lock 중 모든 변경 무시: 고정 전송 보존 / 준비 결과도 오래됨 | 준비와 전송 단계를 구분: 정확한 무효화 / 단계 수명 검사 필요 | B. 준비 중 revision 증가·결과 폐기, 전송/직접 저장은 고정 유지 |

영향: `useSourceRequest → useSelectedRequest → dismissSelectedDraft`에서 target 없는 닫기는 쓰기를 만들지 않는다. 기존 대상의 저장 실패·새 입력·다른 소유자 검사는 유지한다.
영향: `useGeneration → prepareRequest`와 `useSelectedGeneration → prepareSelected`의 비동기 준비에만 revision 검사를 추가한다. 확인 전 변경은 폐기하고, 전송·재시도·직접 수정의 고정 스냅샷은 유지한다.
가정: 실제 변경 저장이 발행하는 기존 request-input-changed 이벤트를 신뢰한다. 단순 설정 조회·닫기는 변경이 아니며, 준비 취소 시 입력을 지우지 않는다.

ADR-WF-024: 추가 실행한 `generation` E2E가 이전 `textarea[required]` 목표 선택자에서 실패했다. 제품의 목표 필수 조건을 복원하면 옛 테스트는 맞지만 요청 중심 계약을 깨뜨린다. 테스트를 현재 선택 필드의 명시적 선택자로 갱신하면 검증 의도를 유지하므로 이를 선택한다. 조건 전달·실패·중단·대화/후보 보존 assertion은 유지한다.
영향: `generation.e2e → generation-fixture → TaskForm/CommonRules`의 입력 탐색만 갱신한다. 제품 코드나 조건 저장 경로를 바꾸지 않는다.

## 작업과 검증

추가 Problem 1-Pager: 배경은 제안 저장 직후의 연속 요청이다. 문제는 `useReview`의 이전 poll이 새 pending의 활성 묶음과 다르지만 결정 sequence는 둘 다 0일 수 있어 확인을 즉시 닫는 것이다(CR-04 · P2). 목표는 실제 변경만 무효화하는 것이며, 비목표는 서버 sequence·저장 스키마 변경이다. 기존 head/활성 묶음의 서버 검증과 실패 시 재확인을 유지한다.
ADR-WF-025: 같은 sequence의 묶음 차이를 무시하면 작지만 실제 새 제안도 감지하지 못한다. 의심되는 poll 차이가 있을 때 저장소를 다시 조회하면 RPC 한 번이 늘지만 과거 관측과 실제 변경을 구분할 수 있으므로 이를 선택한다. 조회 실패에는 확인을 닫고 구체적 재확인 안내를 제공한다.
영향: `GenerationPanel.useRequestPanel → pendingReviewChanged → review_command(state)`의 확인 무효화 경계만 보완한다. 늦은 재조회는 effect 수명으로 차단하고 다른 확인을 닫지 않는다. 가정: Rust의 새 state 조회와 전송 시 expectedActiveBatchId 검증을 권위 경계로 유지한다.

- [x] WF-12-01: 세 재현을 올바른 기대값의 정식 회귀로 옮겨 실패를 확인한다.
- [x] WF-12-02: 최초 target 없는 취소와 두 준비 경합을 작은 가드로 수정한다.
- [x] WF-12-03: 전체 단위·타입·린트·구조 검사와 관련 네이티브 성공/실패·재시작을 실행한다.
- [x] WF-12-04: 최신 일반 빌드를 백업 후 설치하고 출처·원본 데이터 보존을 확인한다.
- [x] WF-12-05: 추가 CR-04의 거짓 무효화·실제 변경·조회 실패·늦은 응답을 실패 선행 단위/네이티브 회귀로 검증한다.

실제 IME·VoiceOver·초보 사용자 과업과 정확한 1440×900 인수는 기존 미확인 상태를 유지한다. 이전 소스의 99건·캡처를 이번 수정의 증거로 재집계하지 않는다.

## 구현과 실패 선행

- CR-01: `selected-dismiss.ts`는 첫 flush·현재 값/소유자 검사 뒤 target이 없으면 쓰기 없이 닫는다. 기존 target의 지시·인용 보관, 확인 만료 저장, 저장 실패 시 닫기 거부는 유지한다.
- CR-02: `useGeneration.ts`는 설정 변경마다 context revision을 갱신하고 준비 시작과 마지막 초안 flush 뒤 값을 비교한다. 일반 PATCH/EXPLAIN/REWRITE의 오래된 확인은 게시하지 않는다.
- CR-03: `useSelectedGeneration.ts`는 준비와 전송/직접 저장 단계를 구분한다. 준비 중 revision 변경은 `prepareSelected` 결과를 폐기한다. CAS·마운트 검사와 이미 실행 중인 고정 요청은 유지한다.
- `request-preparation-race.test.ts`의 최초 세 회귀는 수정 전 모두 실패했다. 로그: `.artifacts/critical-review/regression-before.log`. 이후 실제 DraftStore/DraftPersistence와 hook·준비 함수를 사용해 16건으로 확장했다. 외부 모델/IPC와 React 렌더만 가짜이며 초안 값은 실제 hook처럼 렌더 스냅샷이다.
- 16건은 최초 입력 보관·빈 작업 키 미생성·후속 flush·종료 경계, 세 일반 방식과 세 선택 대상의 모델 지연, 변경 없는 정상 준비, 마지막 flush 중 변경을 검사한다. 기존 고정 전송·저장 실패·새 입력/소유자 회귀도 전체 단위 검사에 포함한다.
- 제품에는 사용자 원문·지시 로깅을 추가하지 않았다. Rust·IPC·schema·CSS 변경은 없고 빈 작업 ID의 서버 거부 계약을 유지한다.
- CR-04는 `usePendingReviewValidity`로 화면 poll의 의심되는 차이를 저장소에서 재확인한다. 기존 무효화 코드를 그대로 분리한 상태에서 새 회귀 5건 중 3건의 실패를 확인한 뒤 수정해 모두 통과했다(`review-validity-before.log`). 실제 변경·조회 실패는 닫고 안내하며 effect 정리 후 늦은 조회는 무시한다. 버튼의 명시적 스크롤/활성 대기와 긴 검사 함수 분리도 테스트에 적용했다. 제품 무효화 assertion을 늦추거나 삭제하지 않았다.

## 현재 증거

- 최종 제품 소스: `4a65c2bbc5181b2ef3bf0bd5db791d3bff15c868133c06dcc95dbad210d3888d`. 전체 단위 **85파일 305건**, 실행 도구 **9건**, 타입·린트·제품/변경 테스트 구조 제한 검사 통과. 중간 `8289d0ee20658e00…` 검사는 baseline-8289d0ee20658e00에 이력으로 보존한다.
- 실제 앱의 `request-followup` 7건과 `selection-popover` 9건에서 최초 취소·초안 복원·저장 실패·준비 중 모델 UI 저장·오래된 결과 폐기·최신 Opus 재확인을 확인했다. 새 [화면 3장·출처](../usage/request-workflow-critical-fixes/README.md)를 직접 검사했다.
- `ux-reliability`의 첫 재시작은 제품 검사 전 네이티브 전면 전환에 실패했다. 원본은 `native-ux-reliability-attempt-1.log`로 보존했고 표시/기대값을 낮추지 않고 해당 시나리오부터 재실행해 6건 통과했다.
- 최종 소스의 관련 네이티브 **11개 시나리오·74건** 통과: generation 5, request-followup 7, selection-popover 9, request-workflow 7, review 6, rewrite 7, ux-reliability 6, selection-transitions 6, source-lifecycle 4, rewrite-review 12, regeneration 5. 빌드·Cargo·네이티브는 모두 순차 실행했다. 테스트 함수 추출 뒤 generation 5건을 다시 실행했으며 중복 집계하지 않는다.
- 최종 출처 증명은 `.artifacts/critical-validation.json`에 기록했다. 이번 범위 밖의 전체 E2E는 전수 실행하지 않았다. `editor/usability/shutdown` 등의 구형 필수 목표 선택자 정비는 별도 테스트 유지보수로 남는다. Rust·IPC·schema 변경이 없어 해당 계약 검사는 새 실행 수에 더하지 않았다.

## 설치·데이터 보존

- 설치본 `4a65c2bbc5181b2e-release`, 실행 파일 SHA-256 `ff437b14b2270d69dd10e011c3be89ba2918b77ce52a6839745c8f9af5daee44`. `/Applications/DocReview.app`과 `~/Applications/DocReview.app`의 해시·서명 일치를 확인했다.
- 설치/검증 시각(UTC): 2026-11-05T14:39:21.261252+00:00 / 2026-11-05T14:39:28.170513+00:00. 일반 debug 빌드도 mode normal로 복원했다. 배포 앱의 arm64·실행 파일 1개·테스트 표시 0개·서명 검증을 통과했다.
- 정상 종료한 이전 앱 두 개, 앱 데이터와 문서 9개를 비공개 백업 `~/Library/Application Support/local.diffraft.docreview-backups/2026-11-05T14-39-20Z`에 해시 검증해 보관했다. 문서 경로 매핑은 비공개 manifest에만 남긴다.
- 교체 전후 앱 데이터·문서 해시 불변, 실행 후 schema 12→12와 문서 9개 해시 및 documents/tasks/versions/proposals/comments/messages 수 보존을 확인했다. 현재 실행은 `/Applications/DocReview.app/Contents/MacOS/docreview`이며 증명은 `.artifacts/critical-installed.json`에 있다. DB·원문을 이전 상태로 되돌리지 않았다.
- Vite 500 kB chunk 경고와 ad-hoc 서명·공증 생략 안내는 유지된다. 실제 한글 IME·VoiceOver·초보 사용자 과업 및 정확한 1440×900 전체 인수는 완료로 표시하지 않는다.
