# 요청·검토 흐름 개선 실행 기록

기준: [SPEC](../../SPEC.md)·[TODO](../../TODO.md) · 2026-11-05 · 상태: 1차 구현·자동 검사·설치 완료 / 후속 검토 보완 계획 수립·미구현 / 수동 인수 대기.

## 문제·범위와 결정

Problem 1-Pager와 ADR-WF-001~011은 SPEC을 따른다. 기존 저장·승인 알고리즘은 유지하고 이름/지속 목표, 최초 초안, 대상이 있는 질문 계약과 요청 UI를 추가한다.

영향: `DocumentTasks → TaskPanel → GenerationPanel`의 최초 진입과 `RequestForm → request.ts → generation_context`의 대상 전달이 바뀐다. `WorkspacePanels → ReviewPanel`의 후속 행동과 공통 초안·타입/이관 경계에 회귀 검사가 필요하다.

### ADR-WF-006: 작업 생성 전 초안 보관

- 기존 drafts의 task 외래 키를 없애는 안: 기존 경로 재사용 / 소유권과 작업 삭제 계약이 약해질 위험.
- 문서 소유의 first-request 보관소를 추가하는 안: 기존 작업 초안 계약 유지 / 별도 CAS·인계 검증 필요.
- 두 번째 안을 선택한다. 임시 작업 식별자는 문서별 초안 키에 저장하며 실제 작업 인계가 확인되기 전에 원본을 지우지 않는다.

## WF-00 기준 검사

- 최초 제품 소스: `900ce5db5800520784ecca153af2a038677e03fc07bcd700898b232a051b16f7`.
- 기준 `test:unit`: Vitest 69파일·237건 및 Node 9건 통과. 로그: `.artifacts/request-workflow-baseline-unit.log`.
- 기준 `native:build:e2e`: 성공, ID `900ce5db58005207-e2e`. 로그: `.artifacts/request-workflow-baseline-build.log`. 단일 `build-e2e.json`은 후속 빌드로 갱신됐으므로 당시 바이너리 해시의 보관 증거로 쓰지 않는다.
- 기준 `ux-local`: 6건 통과·1건 실패. 실패는 `verifyCandidateKeyboard`의 Shift+F10 뒤 포커스 대기(92행) 시간 초과다. 제품 수정 전 발생했으며 숨기거나 통과로 간주하지 않는다.
- 이 실행의 첫 요청·종류·직접 수정·완료 캡처는 기준으로 확인했다. 모든 상태/크기 조합의 최신 캡처 완료를 뜻하지 않는다.
- 새 `workflow_tasks` 회귀는 작업명/목표 분리, 구형 작업, 생성 전 초안의 CAS·재시작·미소유 문서 거부를 검사한다. 실패 선행 결과와 수정 후 결과는 이어 기록한다.

## 검증 원칙

자동 검사·네이티브 화면·실제 키보드·작성자 과업·한국어 IME·VoiceOver를 구분한다. 사용자 DB/실제 계정을 쓰지 않는다. AC15/AC16은 실제 확인 전까지 미완료다.

## 구현 경계와 회귀

| 작업 | 변경과 사후 조건 | 주요 검증 |
| --- | --- | --- |
| WF-01 | schema 12의 작업 이름·문서 소유 최초 초안, 타입이 있는 변경 질문. 기존 goal·요청·AI 응답·승인/저널 유지 | `workflow_tasks` 4건, `workflow_migration` 2건, `workflow_questions` 4건. 이전 이관 fixture도 schema 12에 맞춤 |
| WF-02 | `FirstRequest → handoffFirstRequest`가 첫 지시만으로 안정된 ID의 작업을 준비. 목표/조건은 선택 입력 | 첫 인계·저장/선택 실패·늦은 응답·다른 문서 전환·재시작, 원문 선택 첫 진입 |
| WF-03 | 공통 `RequestForm/RequestInput`, 목적·대상·방식 분리. 재작성·참고 후보도 같은 작성기에 연결 | 모드별/대상별 초안, 명시적 충돌 선택, 의미가 같은 질문 스냅샷 비교, 모델·조건 변경 무효화 |
| WF-04 | `이 변경 / AI 요청·대화`, 후보의 더 고치기·변경 질문. CHANGES는 원문 재선택 | 잘못된 소유권·head·ID·revision·해시·단위 일부 질문 거부. 가짜 Claude/Codex 프로세스가 받은 전후 내용 검사 |
| WF-05 | r1 기본 숨김, 수정안 비교, 내용/결정 중심 처리 기록, 코멘트 등록/초안 보관 구분 | 기존 결과 링크·과거 비교·문서 복원·코멘트 늦은 응답 회귀 |
| WF-06 | 공동 승인 범위와 남은 승인 발견성, 완결된 이동 문구, 16px 본문·확대 화면 | 단위 검토 bounds/hit·읽던 위치·도구/비교 전문·중복 결정 방어 |

질문은 서버가 복원한 전후 내용의 해시와 소유권을 다시 확인한다. 두 공급자에는 같은 `questionTarget`을 전달하고 일반 원문 scope는 비운다. 질문 후 문서·후보·결정·회차가 바뀌지 않으며 답변에는 저장된 질문 대상과 원래 결과로 돌아가는 연결을 제공한다.

최초 인계는 문서 작업 게이트와 화면 소유자·초안 포인터 CAS로 보호한다. 네이티브 선택 확인 응답 뒤에도 소유자를 검사하며, 원본 초안은 인계 표시 후 컴포넌트가 떠난 다음 정리해 초기값이 다시 생기는 경합을 막는다. 요청 준비의 오래된 리뷰 poll은 새 확인을 지우지 않고 더 최신 sequence의 변경은 무효화한다. 실행 잠금 이후의 조건/모델 변경은 이미 고정된 실행에 소급하지 않는다.

### ADR-WF-007: 섹션 대상 고정

현재 커서를 계속 읽는 안은 작지만 다른 섹션을 읽는 것만으로 요청 범위가 바뀐다. 선택/범위 확인 때 커서를 보관하는 안은 구형 초안 재확인이 필요하지만 표시·실행을 일치시킨다. 후자를 선택했다. 전체 문서는 인용을 버리고, 선택 영역만 정확한 원문 스냅샷으로 검증한다. 저장 커서가 없는 구형 섹션 초안은 명시적 범위 확인을 요구한다.

## 실패 선행과 자동 검사

- `.artifacts/request-workflow-*-before.log`: 이름/목표·최초 보관 계약, 변경 질문 계약, 최초 인계, 자동 확인 CAS, 화면 소유자 변경, 원문 진입 후 범위 변경, 구형 섹션 재확인의 실패를 먼저 확인했다. 모든 실패가 네이티브 화면의 수정 전 촬영인 것은 아니다.
- 최신 JS: Vitest 79파일·266건 + Node 9건 통과. 타입 검사·Biome 린트·프런트 빌드 통과. 아래 로그 경로는 `apps/desktop` 기준이다. `.artifacts/request-workflow-{unit,types,lint,build}.log`.
- 구조: 변경 코드 파일 ≤300행. 변경 프런트 함수의 본문 ≤50행·매개변수 ≤5·분기 복잡도 ≤10을 Lezer 구문 트리로 검사했다. `.artifacts/request-workflow-structure.log`; Rust는 Clippy의 프로젝트 제한도 통과했다.
- Rust: `native:fmt`, `native:check`(-D warnings), `native:test`, `contracts:check` 통과. 52개 결과 묶음 합계 381건 통과·30건 ignored. 외부 실제 계정 검사는 실행하지 않았다. `.artifacts/request-workflow-native-{check,test}.log`, `request-workflow-contracts-check.log`.
- 빌드에는 Vite의 500kB 초과 청크 경고가 남는다(주 청크 약 515kB). 요청 흐름과 관계없는 번들 분할 변경은 추가하지 않았다.

## 통합·수동 인수 상태

최종 제품 소스 `1c063d0a63c3ad9d1beccfd85dab79891e255472c9a7905e2b008a7b9e8ba02a`, E2E 빌드 `1c063d0a63c3ad9d-e2e`에서 아래 88건을 순차 실행해 통과했다. E2E 실행 파일 SHA-256은 `9912f55c484d183da485c394659d6fbcca86a89518ebc51c955f863093093f01`이다.

| 선택 실행 | 통과 건수 |
| --- | ---: |
| request-workflow + restart | 6 |
| selection-popover + layout + restart | 9 |
| ux-reliability + restart | 6 |
| selection-transitions + restart | 6 |
| source-lifecycle | 4 |
| review | 6 |
| rewrite | 7 |
| rewrite-review + restart | 12 |
| rewrite-review-keyboard | 8 |
| review-followup | 5 |
| history | 4 |
| recovery + restart | 2 |
| export + restart | 6 |
| ux-local | 7 |

로그: `.artifacts/request-workflow-<선택 실행>.log`. React 교체 중의 WebDriver stale-element 경고는 재조회 뒤 통과했으며 창 표시 실패와 구분했다. 표시 전제 실패 및 수정 전 실패 로그도 보존했다. 마지막 `ux-local`은 06:28:45 UTC 시작 실행의 7건 통과 결과다. 스크롤 뒤 즉시 Shift+F10을 보내던 기준선 실패는 팝오버 닫힘·포커스 복귀 후 실제 두 프레임과 같은 사후 조건을 다시 확인하도록 검사 경계를 보완했다.

[최신 화면 8장·manifest](../usage/request-workflow/README.md)는 같은 E2E 빌드 출처다. 첫 요청·후보 질문·단위 질문·완료·짧은 변경의 각 9개 조합(총 45건)을 함께 보관했다. 전체 본문·코멘트·오류·처리 기록 격자는 `.artifacts/unit-review/after`, 긴 선택 작성기는 `.artifacts/ux`에 남겼다. 명시적 대상 이동·스크롤 후의 측정은 초기 viewport와 구분한다.

E2E 종료 뒤 `npm run native:build`로 일반 debug 앱을 복원했다(06:29:22 UTC 빌드 시작). ID `1c063d0a63c3ad9d-debug`, SHA-256 `37d45c0dd311e5d59581a1ec0f209dab19b313ce1d77ce7c8bcd7b9814b459a8`. 현재 소스·E2E 소스 일치, normal 빌드 증명·실행 파일 바이트 해시 일치, `e2e_process_id`·`DOCREVIEW_E2E_DATA` 문자열 제외를 확인했다. 로그/증거: `.artifacts/request-workflow-normal-{build.log,verification.json}`. 설치 앱 교체·배포·커밋은 수행하지 않았다.

### ADR-WF-008 및 통합에서 발견한 경합

공통 작성기로 옮긴 재작성은 검토 poll(1초)보다 먼저 요청을 시작해 기존 후보의 적용 버튼이 잠깐 활성화됐다. 실패한 `rewrite` E2E를 기준으로 문서 작업 게이트 전체 잠금과 전송 경계의 실행 상태 공유를 비교했다. 전자는 허용된 보기·작업 이동도 막으므로 후자를 택했다. 확인 직후의 초안 보관부터 `sendRequest`의 성공/실패까지 문서별 토큰으로 검토를 잠근다. 중첩 요청 하나가 실패해도 다른 실행의 잠금은 해제하지 않는다. 보관 중 작성기가 바뀌면 전송하지 않고 이전 입력을 보존한다. `generation-activity` 2건·`generation-submit-lock` 3건과 실패 선행 로그로 확인했다.

재작성 네이티브 검사는 고정 지연 동안 순간 상태를 추측하는 대신 소유 임시 폴더의 준비/해제 신호로 공급자의 응답 시점을 제어한다. `REWRITE_DELAY`의 기존 기본 동작은 유지한다. 변경 질문 중단은 공급자가 SIGTERM 때 늦게 답하는 `EXPLAIN_CANCEL_RACE`를 사용해 대상·입력·원문 보존을 검사한다.

화면 격자에서 상세 패널 뒤의 본문을 측정한 오류는 실제 본문 복귀 후 검사하도록 고쳤다. macOS 창 표시·프레임 전제 실패는 통과로 처리하지 않았다. 별도의 창 선택/재조회 시도는 표시 문제를 해결하지 못해 제외했다. 최종 표시 경계는 ADR-WF-011을 따른다.

### ADR-WF-009: 최초 입력의 닫기·복원

별도 조건/진입점 복사본을 추가하는 안은 보관이 명시적이지만 원본과 이관 분기가 늘어난다. 기존 공통 조건의 flush를 연결하고 최초 초안 키를 재사용하는 안은 작지만 닫기 실패·범위 왕복 검사가 필요하다. 후자를 선택했다. 첫 원문 요청의 공통 조건은 문서 이탈과 작성기 닫기 전에 저장하며 실패하면 입력창을 유지한다. 원문 선택에서 전체/섹션 대상으로 바꾼 미전송 초안은 같은 문서의 같은 첫 요청으로 간주해 복원한다. 회귀: `source-first-conditions`, `source-request-close`, `first-request` 및 각각의 `*-before.log`.

### ADR-WF-010: 짧은 변경의 동시 읽기

추가한 짧은 제목 변경의 9개 격자는 800×600·200%에서 추가 문장 잘림을 먼저 검출했다. 기존 긴 문장 검사는 스크롤 가능성을 확인하므로 이 조건의 대체 증거로 쓰지 않았다. 본문 최소 높이를 늘리는 안은 결정을 밀어낼 수 있어, 중복 제목을 18px로 줄이고 상단 12px 여백을 없애는 안을 선택했다. 본문 16px·변경 문맥은 유지하고 gutter 높이/색 경계도 같은 CSS 변수로 맞췄다. 최종 9개 조합에서 삭제·추가 문장 전체 읽기와 결정 버튼 hit가 함께 통과했다. 자료: `.artifacts/unit-review/after/short-*.json`.

### ADR-WF-011: 검증한 앱과 지정 창의 활성화

접근성 창 목록의 첫 항목을 올리고 위치를 강제하는 기존 방식은 숨김·보조 창 상태에 의존했다. WebDriver의 지정 창을 화면 안에 배치하고 검증한 PID/실행 파일의 앱을 활성화한 뒤 Tauri의 지정 창을 다시 포커스하는 방식을 선택했다. 키보드 도구의 AX 창 목록 조회·위치 변경은 제거했고, 전면 프로세스 일치·허용 키·입력 직전 PID 검사와 실제 표시·두 프레임 검사는 유지했다. 이미 네이티브 키/화면 검증을 수행하는 단계의 시작에도 같은 순서를 사용한다. 정상 앱의 권한·표시 방식은 바꾸지 않는다.

마지막 `ux-local`의 화면 전제는 창 X=-1641/-1728 상태에서 실패했다. 지정 창 배치만으로는 표시 전환을 안정시키지 못해 기존 WebDriver rect 배치와 최대 5초의 visible 확인을 함께 사용했다. 두 프레임 대기는 기존 1초 제한을 유지한다. Tauri `center`는 허용되지 않아 적용하지 않았고 앱 권한을 추가하지 않았다. 실패 로그는 `request-workflow-ux-local-{hidden-window,offscreen-window,center-denied,window-transition,last-hidden}.log`로 보존했다. 이는 실행 환경 전제의 회복이며 제품 화면 계약을 완화하지 않는다.

초보 작성자 3명의 과업(AC15), 실제 한국어 IME·VoiceOver(AC16)는 미실행이다. 자동 키·합성 composition·DOM 접근성 검사로 대체하지 않는다. 초기 모든 상태의 전체 화면 격자와 잘못된 안내의 네이티브 실패 선행 촬영도 완전하게 확보하지 못했으므로 해당 기준선 작업은 별도 미완료로 남긴다.

## 후속 검토·설치와 보완 계획

- [구현 목적 검토](../../.impeccable/critique/2026-11-05T06-45-31Z__apps-desktop-src-review-reviewpanel-tsx.md)에서 종류별 초안 전환·입력 포커스·재제안 확인 무효화의 P1 세 건을 확인했다. 기존 통과 이력만으로 모든 인수 조건을 만족한다고 판단하지 않는다. 수정은 SPEC 9절·TODO WF-09~11에 계획했고 아직 구현하지 않았다.
- 사용자의 최신 설치 요청에 따라 `native:bundle:internal`을 실행했다. 릴리스 소스가 위 E2E 소스와 같고 arm64·실행 파일 1개·ad-hoc 서명·테스트 코드 제외 검사를 통과했다. Vite 청크 크기와 미공증 내부 배포 경고는 유지된다.
- 2026-11-05 07:00 UTC에 `/Applications/DocReview.app`과 `~/Applications/DocReview.app`을 함께 교체했다. ID `1c063d0a63c3ad9d-release`, SHA-256 `dfddec167feafe3194a69d1982f40e0c266914437cde899dc712e470852ee54f`. 두 설치본의 서명을 확인했다.
- 교체 전 두 앱·앱 데이터·등록 문서 9개를 사용자 Library의 비공개 백업에 보관했다. 교체 중 데이터 해시는 같았고 실행 뒤 schema 11→12와 문서 9개·파일 바이트 보존을 확인했다. `/Applications`의 설치본을 실행해 PID/경로/해시를 확인했다. 실제 사용자 문서 내용·인증값은 로그에 출력하지 않았다.
- 설치 근거는 `apps/desktop/.artifacts/request-workflow-{release-build.log,install-release-proof.json,installed.json}`이며 백업 위치는 비공개 설치 기록에서 확인한다. 이번 실행 확인은 설치·이관·문서 보존 범위이며 사용자 과업·실제 AI 생성 성공의 검증이 아니다.
- 추가 사용자 요구: 드래그 뒤 이 부분 수정에 진입한 상태에서 다른 본문을 클릭하면 화면 선택과 작성창을 닫되 지시는 초안으로 보존한다. 새 드래그·입력/버튼 조작·확인창·전송 중은 구분한다. SPEC F07·TODO WF-10-01~03에 반영했다.
