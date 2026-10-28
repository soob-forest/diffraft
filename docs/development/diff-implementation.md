# Diff 구현 상세와 화면 계약

문서 식별자 DEV-DIFF  |  버전 0.2  |  작성 기준일 2026년 10월 26일

[개발 설계](architecture.md)의 16절을 분리했다. 승인·저장·IPC의 공통 계약은 개발 설계, 사용자 동작은 [기능 명세](../product/specification.md)를 따른다.

## 16 Diff 구현 상세와 화면 계약

### 16.1 비교 데이터는 앱에서 만든다

AI 응답의 `before/after`는 검증할 입력이다. 줄 번호·통계·강조·hunk ID를 모델 출력에서 신뢰하지 않는다. Rust에서 블록·원문·범위를 검증하고 계산한 행 diff와 편집 연산을 UI에 보낸다. 제품은 이 결과를 CodeMirror 읽기 전용 버퍼로 표시하며 `@codemirror/merge`의 자동 반영 기능을 사용하지 않는다.

```typescript
type ReviewProjection = {
  projectionId: string;
  documentId: string;
  batchId: string;
  immutableBaseVersionId: string;
  currentHeadVersionId: string;
  before: string; // 현재 확정본, 저장 완료된 정확한 소스
  after: string;  // 유효한 미승인 그룹만 가상 적용한 예상본
  groups: ReviewGroup[];
  stats: { addedLines: number; removedLines: number; pendingGroups: number };
};
type ReviewGroup = {
  groupId: string;
  proposalRevisions: { id: string; revision: number }[];
  beforeByteRanges: { start: number; end: number }[];
  afterByteRanges: { start: number; end: number }[];
  validity: 'VALID' | 'STALE' | 'CONFLICT';
};
```

이 타입은 설계 계약이며 실제 컴파일된 라이브러리 API가 아니다. 표시 hunk와 승인 그룹은 1:1을 전제하지 않는다. 하나의 의존 그룹이 떨어진 여러 구간을 가질 수 있고, 시각적으로 인접한 여러 그룹은 같은 문맥 안에 보일 수 있다. 각각의 표시 구간을 `groupId`에 매핑하고, 결합 그룹을 승인할 때는 포함 구간을 모두 강조한다. 관계를 안전하게 나누지 못하면 하나의 그룹 또는 REWRITE로 처리한다.

### 16.2 편집기에서 원문을 직접 바꾸지 않는다

비교의 두 버퍼는 기본 read-only다. CodeMirror가 제공하는 accept/revert 버튼으로 버퍼를 즉시 수정하고 파일에 저장하는 방식은 사용하지 않는다. 기본 버튼을 끄거나 검증된 사용자 정의 행동으로 치환한다. “승인”은 ID/revision/expected head/operation ID를 Rust에 전달하고 저장 성공 응답 후 새 projection을 조회한다. 실패 시 양쪽 텍스트와 결정 상태를 원래대로 유지한다.

부분 승인 후 immutable base는 보존하고, 같은 묶음의 승인 연산을 현재 head에 반영하여 남은 연산의 위치를 결정적으로 재계산한다. 사용자의 직접 수정이나 외부 변경이 끼면 자동 의미 병합 대신 STALE로 만든다. 비교 화면의 before는 이때의 current head이며 원래 요청 기준은 별도 메타데이터다. 두 버전이 달라질 수 있으므로 화면 레이블도 함께 갱신한다.

### 16.3 줄·표현 diff와 Markdown 보존

논리 행 diff를 먼저 계산하고 교체된 행 내부에 문자 또는 단어 단위 diff를 적용한다. 한국어·영어 혼합과 이모지는 grapheme 경계를 지킨다. 변경 표현을 찾기 어렵거나 한도에 도달하면 줄 강조로 안전하게 낮춘다. 의미 요약으로 차이를 대체하지 않는다.

줄 정렬, 동기화 스크롤, 변경 문맥 접기와 확장은 표시 계층의 기능이다. 원문 byte 범위와 통계는 자동 줄바꿈에 영향받지 않는다. 긴 문서는 계산을 UI 스레드 밖에서 수행하고 projection ID가 지난 결과는 폐기한다. 접힌 문맥 안에는 원문을 실제로 보관하며 승인 시 생략된 문자열을 사용자가 보이는 부분으로 다시 만들어 쓰지 않는다.

표와 목록, 코드 블록은 소스 diff가 기준이다. WYSIWYG로 되직렬화하지 않는다. 공백 변경을 무시하면 Markdown 줄바꿈·목록 들여쓰기 등이 손실될 수 있으므로 MVP의 승인 검증과 표시 계산에는 공백을 포함한다. 소스 차이가 있는데 통계가 0이 되는 계산 오류를 테스트한다.

### 16.4 코멘트 앵커

`anchor_json`에는 `side=before|after`, document version 또는 proposal revision, 블록 ID, 소스 byte 범위, 인용문과 주변 문맥을 기록한다. 화면의 UTF-16 위치는 공통 변환 함수로 byte 범위로 바꾼다. 인라인/나란히 전환은 동일한 논리 앵커의 다른 표현이다.

재제안 시 위치를 확정할 수 있으면 새 구간에 연결하되 원래 revision을 유지한다. 위치를 확정하지 못하면 코멘트 패널에 “연결 위치 확인 필요”로 남긴다. 모델이 코멘트를 반영했다고 답해도 자동으로 해결됨 처리하지 않는다.

### 16.5 추가 UI 명령

| 명령 | 입력과 결과 |
| --- | --- |
| get_review_projection | batch_id, expected_head → 읽기 전용 projection, 그룹·통계·유효성 |
| save_proposal_revision | proposal_id, expected_revision, draft_text → 검증된 새 미승인 revision. canonical 파일은 불변 |
| add_review_comment | target/revision, side, anchor, text → 코멘트 ID. 위치와 소유 작업 검사 |
| set_comment_status | comment_id, expected_revision, open/resolved → 상태 저장. 원문 변경 없음 |
| discard_batch | batch_id, expected_state → 미승인 항목만 취소. 이미 승인한 내용 유지 |
| get_version_diff | document_id, current_head, target_version → 현재→대상 diff. 복원 실행과 분리 |

확인창은 승인 권한을 미리 확보하지 않는다. 최종 클릭에서 기존 `accept_proposals` 검증을 다시 수행한다. 응답을 기다리는 동안 재클릭을 차단하고 동일 operation ID를 유지한다.

### 16.6 자산과 테스트 입력

화면 SVG와 PNG는 [화면 자산](../design/assets/screens)에, 색·크기 기준은 [design-tokens.json](../design/assets/design-tokens.json)에, 예시 원문과 후보는 [예시 데이터](../examples)에 있다. 정적 화면의 버튼은 구현되어 있지 않다. 실제 제품에서 연결할 행동은 [디자인 명세](../design/design-guide.md)와 [시나리오](../design/scenarios.md)를 따른다.

스크린샷 픽셀 일치만으로 승인 기능을 검증하지 않는다. 고정 fixture로 projection, 승인 후 정확한 본문, 복원 결과와 코멘트 앵커를 검사한다. 시각 회귀 검사는 이 핵심 검증에 덧붙인다.

- [D13 CodeMirror merge 공식 보관본: 이전 안내와 split/unified 사용 예](https://github.com/codemirror/merge)
- [D14 공식 이전 저장소](https://code.haverbeke.berlin/codemirror/merge)

CodeMirror merge 자료는 비교 UI 설계의 참고 자료다. 제품이 사용하는 정확한 패키지 조합은 [package.json](../../apps/desktop/package.json)과 lockfile을 따른다.
