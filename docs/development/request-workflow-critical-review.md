# 요청 흐름 추가 결함 검토

2026-11-05 · 최초 검토 기준 소스 `05a59e436eb900b6c9575f01e1adc1efca2017377d19e576cbd61bd250301cd6` · 상태: **P1 1건·P2 3건 수정·자동 검증·최신 설치 완료**. [수정·인수 기록](request-workflow-critical-fixes.md).

## 범위와 검증 방식

최근 선택 해제·초안 보관·확인 준비/무효화와 호출 경로를 전체 읽었다. 저장 키의 Rust 검증, 공유 저장 큐, 종료 flush, 최초 요청 인계, 모델 설정 이벤트, 선택/일반 요청 확인 경계를 대조했다. 최초 검토 시점에는 제품 코드·설치 앱·사용자 DB·문서를 변경하지 않았다. 이후 수정 결과는 별도 기록으로 연결한다.

정적 추론만으로 판정하는 방법은 빠르지만 경합을 과장할 수 있다. 실제 hook·DraftStore·DraftPersistence에 지연 모델 응답과 계약 transport를 연결해 실행하는 방법은 순서를 통제할 수 있으므로 이를 선택했다. React UI 렌더와 외부 I/O는 가짜이며, 빈 작업 ID 거부는 실제 Rust 검증으로 별도 확인했다. 이번 검토를 네이티브 화면 재실행이나 전체 앱 무결성 보증으로 해석하지 않는다.

## CR-01 · P1: 최초 선택 수정의 클릭 취소가 공유 초안 저장을 막음

- 위치: `src/editor/useSourceRequest.ts:89`, `src/review/selected-dismiss.ts:25`, `src/review/useSelectedRequest.ts:203`.
- 재현: 작업이 없는 문서에서 원문 드래그 → 이 부분 수정 → 다른 본문 위치 클릭. 작업 생성 전이므로 `taskId`는 빈 문자열이다.
- 원인: 실제 선택 수정 target이 없는 상태에서도 `dismissSelectedDraft`가 새 값을 써서 `["selected-request", documentId, "", "source-empty"]`를 dirty 큐에 넣는다. Rust의 `DraftWrite::validate`는 세 번째 요소를 UUID로 검증하므로 저장을 거부한다.
- 영향: 작성 화면이 닫히지 않는다. 실패한 키가 공유 DraftPersistence의 dirty 큐 첫 항목으로 남아 이후 유효한 첫 요청/다른 초안 flush도 같은 오류로 실패한다. 정상 종료도 `useAppClose`에서 같은 flush를 기다리므로 차단된다. Markdown 원문 파일의 자동 저장과 이 초안 큐는 별개다. 이미 저장된 DB·원문 삭제를 재현한 것은 아니다.
- 근거: 실제 `useSelectedRequest`와 저장 큐로 닫기 실패 → 다른 유효 초안의 저장 실패 → 종료 flush 실패를 재현했다. 실제 Rust `DraftWrite::validate`도 해당 키를 거부했다. 기존 클릭 취소 E2E는 이미 작업이 있는 fixture여서 이 경로를 검사하지 않았다.
- 권고: 작업 생성 전에는 기존 first-request 초안만 보관하고 선택 UI를 닫는다. target 없는 선택 수정 초안을 저장하지 않는 가드를 둔다. 빈 작업 ID를 서버에서 허용하는 대안은 소유권 계약을 약화하므로 피한다. 새 문서의 클릭 취소→새 첫 요청→정상 종료 회귀가 필요하다.
- 수정 전 회피: 작업 없는 최초 선택 수정에서는 본문 클릭 대신 **원문으로 돌아가기** 버튼을 사용한다. 이 회피는 잘못된 키가 큐에 들어가기 전의 조치다.

## CR-02 · P2: 일반 요청 확인 준비 중 설정 변경이 누락됨

- 위치: `src/generation/useGeneration.ts:31`, `src/generation/useGeneration.ts:189`.
- 재현: 요청 내용 확인 → 모델 조회 응답을 지연 → 전역 AI 설정에서 모델 변경·저장 → 이전 모델 조회 응답 완료.
- 원인: 무효화 callback은 이미 `pending`이 있을 때만 동작한다. 준비 중에는 아직 pending이 없으므로 설정 변경 이벤트가 소실된다. 이어지는 비동기 완료는 준비 시작 이후 설정 변경 여부를 확인하지 않고 pending을 저장한다.
- 영향: 최신 모델로 다시 확인해야 하는 시점에 이전 모델의 확인이 나타난다. 확인창에는 이전 모델이 표시되지만, 최신 설정을 반영할 것으로 기대한 사용자가 그대로 실행하면 이전 모델을 사용한다. 일반 PATCH/EXPLAIN/REWRITE의 공통 준비 경로에 해당한다.
- 근거: 실제 `useGeneration → prepareRequest → useRequestDraft`에 지연 모델 응답을 연결했다. 설정 변경 이벤트 후 이전 Sonnet 확인이 남는 것을 확인했다. 외부 AI 호출은 하지 않았다.
- 권고: 기존 재제안의 context revision 방식처럼 준비 시작 revision을 저장하고, 비동기 완료에서 달라졌으면 확인을 만들지 않는다. 전송을 확정한 고정 요청과 준비 중 요청을 구분한다. 다른 설정 창을 막는 대안은 사용 흐름을 제한하므로 작은 revision 검증을 우선한다.

## CR-03 · P2: 선택 수정은 준비 중에도 무효화를 차단함

- 위치: `src/review/useSelectedGeneration.ts:23`, `src/review/selected-request-operations.ts:25`.
- 재현: 원문/후보 선택 수정의 확인 준비 → 모델 조회 지연 → 모델 변경 이벤트 → 이전 준비 완료.
- 원인: `operation.lock`이 준비·전송·직접 수정 모두에 쓰이는데, 무효화 조건이 `!operation.lock.current`다. 아직 전송을 확정하지 않은 준비 작업도 실행 중 고정 요청처럼 처리한다. `prepareSelected`의 CAS는 입력 교체만 감지하며 설정 변경 epoch를 감지하지 않는다.
- 영향: 원문·후보·전체 후보의 선택 수정에 이전 모델의 prepared 확인이 남는다. 조건 변경도 동일 이벤트 경계를 사용하므로 같은 방어 누락을 검토해야 한다. 이번 실행에서 직접 재현한 것은 모델 변경이다.
- 근거: 실제 `useSelectedGeneration → prepareSelected → prepareSelectionRequest`로 준비 중 무효화 이벤트 후 Sonnet prepared가 저장되는 것을 확인했다. 전송 확정 후 고정 요청 유지 동작은 이 결함과 구분한다.
- 권고: 준비/전송 단계를 구분하고 준비 중 변경은 지연 결과를 폐기한다. CR-02와 함께 공통 무효화 계약을 정하되 초안 대상·지시와 이미 전송한 요청은 보존한다.

## CR-04 · P2: 연속 요청에서 이전 화면 조회가 새 확인을 닫음

추가 CR-04 · P2: `8289d0ee20658e00…`의 네이티브 연속 요청에서 새 제안 직후 다음 확인이 바로 닫혔다. 생성 전/후 활성 묶음이 달라도 결정 sequence는 모두 0일 수 있어, `GenerationPanel → pendingReviewChanged`가 이전 화면 poll을 실제 변경으로 오인했다. `generation`의 응답 형식 오류 검사 진입에서 재현했으며 조건 입력 선택자 갱신·버튼 명시적 스크롤 후에도 남는 제품 결함으로 구분했다. 해결은 의심되는 poll 차이에 저장소 state를 재조회하는 것이다. 새 `usePendingReviewValidity`의 거짓 무효화·실제 묶음/결정 변경·조회 실패·수명 회귀와 최종 소스의 네이티브 생성/재시작 5건으로 검증한다.

## 최초 검토의 실행 증거와 남은 범위

- 기존 단위 검사 재실행: 83파일 284건 + 실행 도구 9건 통과.
- 추가 재현: TypeScript 3건, 실제 Rust 검증 1건 실행 성공. 이 probe는 **현재의 잘못된 동작을 확인하는 assertion**이므로 통과가 수정 완료를 뜻하지 않는다.
- 자료: `apps/desktop/.artifacts/critical-review/probes.log`, `probe.test.ts`, `vitest.config.mjs`, `rust-probe.log`, `rust-probe.rs`, `baseline-unit.log`. 임시 정식 테스트 위치의 파일은 실행 후 제거했다. 이 probe의 잘못된 동작 assertion은 검토 기준 소스의 이력이다. 현재 수정 검증은 `npx vitest run tests/request-preparation-race.test.ts`로 실행한다.
- 최초 검토 시점에는 제품 소스와 두 설치 앱의 해시 불변을 확인했다. 기존 네이티브 99건은 그 이전 실행 이력이다. 이후 수정 소스의 74건과 설치 결과는 별도 [수정 기록](request-workflow-critical-fixes.md)을 따른다.
- 실제 한글 IME·VoiceOver·초보 사용자 과업, 정확한 1440×900 화면은 기존 미확인 상태다. 이번 결과는 특히 요청·초안 경계에 대한 검토이며 모든 잠재 결함의 부재를 보장하지 않는다.
