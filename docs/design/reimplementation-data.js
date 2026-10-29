globalThis.reimplementationScreens = [
  {
    "id": "S00_connection",
    "title": "처음 실행 · 연결 확인",
    "target": "assets/screens/S00_connection.png",
    "before": "reimplementation-captures/before/connection-ready.png",
    "after": "reimplementation-captures/after/connection-ready.png",
    "tasks": "R5-03",
    "note": "상태→주요 행동→접힌 진단. 이전 캡처는 진단 펼침 상태."
  },
  {
    "id": "S01_editor",
    "title": "문서 편집 · 범위 지정",
    "target": "assets/screens/S01_editor.png",
    "before": "reimplementation-captures/before/usability-request.png",
    "after": "reimplementation-captures/after/design-request.png",
    "tasks": "R1-01 R2-01",
    "note": "v12 여행 문서·작업 선택·조건 접힘. 원본 시안과 문서/범위가 다름."
  },
  {
    "id": "S02_inline_diff",
    "title": "변경 검토 · 인라인 diff",
    "target": "assets/screens/S02_inline_diff.png",
    "before": "reimplementation-captures/before/usability-review.png",
    "after": "reimplementation-captures/after/design-review.png",
    "tasks": "R3-02 R3-03",
    "note": "v12 첫 변경. 오른쪽 상세·두 도구 행·16px 본문을 비교."
  },
  {
    "id": "S03_split_diff",
    "title": "변경 검토 · 나란히 diff",
    "target": "assets/screens/S03_split_diff.png",
    "before": "reimplementation-captures/before/review-wrap-150.png",
    "after": "reimplementation-captures/after/design-split.png",
    "tasks": "R6-02",
    "note": "이전은 확대/긴 문서 참고. 새 화면은 v12 나란히 보기. 상태 일치 비교 아님."
  },
  {
    "id": "S04_comment_revision",
    "title": "코멘트 · 다시 제안받기",
    "target": "assets/screens/S04_comment_revision.png",
    "before": "reimplementation-captures/before/usability-comment.png",
    "after": "reimplementation-captures/after/design-comment.png",
    "tasks": "R4-01 R4-02",
    "note": "원본은 v13/r2, 실제는 v12 코멘트 작성. 오른쪽 배치와 입력 동선을 비교."
  },
  {
    "id": "S05_bulk_approve",
    "title": "전체 승인 · 대상 확인",
    "target": "assets/screens/S05_bulk_approve.png",
    "before": "reimplementation-captures/before/usability-bulk-confirm.png",
    "after": "reimplementation-captures/after/bulk-two.png",
    "tasks": "R3-04",
    "note": "새 화면은 D02 거절 후 D01/D03 두 제안 확인. 이전 캡처는 100개 극단 상태 참고이며 동일 상태 비교는 아님."
  },
  {
    "id": "S06_full_rewrite",
    "title": "전체 재작성 · 방향 비교",
    "target": "assets/screens/S06_full_rewrite.png",
    "before": "reimplementation-captures/before/rewrite-w02.png",
    "after": "reimplementation-captures/after/rewrite-w02.png",
    "tasks": "R5-01",
    "note": "v14→W02 후보, 미승인. 이전/새 후보 이동과 전체 적용 구분."
  },
  {
    "id": "S07_restore",
    "title": "버전 복원 · 바뀔 내용 확인",
    "target": "assets/screens/S07_restore.png",
    "before": "reimplementation-captures/before/restore-comparison.png",
    "after": "reimplementation-captures/after/restore-comparison.png",
    "tasks": "R5-02",
    "note": "현재→선택 버전 방향. 이전/새 캡처의 버전은 이미지 표기를 따른다."
  },
  {
    "id": "S08_resume",
    "title": "작업 재개 · 맥락 이어가기",
    "target": "assets/screens/S08_resume.png",
    "before": "reimplementation-captures/before/generation-conversation.png",
    "after": "reimplementation-captures/after/design-resume-v13.png",
    "tasks": "R5-02",
    "note": "독립 SC07 분기: D02 거절·D01 승인 뒤 v13/D03 r2로 별도 프로세스 재시작. 원문 재개 안내를 표시."
  },
  {
    "id": "S09_conflict",
    "title": "외부 변경 · 충돌 해결",
    "target": "assets/screens/S09_conflict.png",
    "before": "reimplementation-captures/before/conflict-copy.png",
    "after": "reimplementation-captures/after/conflict-comparison.png",
    "tasks": "R5-04",
    "note": "새 화면은 앱 버퍼/외부 파일 비교 후 복구 행동을 선택하는 상태. 이전 캡처는 삭제 파일의 사본 저장 분기 참고."
  },
  {
    "id": "S10_export",
    "title": "확정본 확인 · 복사와 저장",
    "target": "assets/screens/S10_export.png",
    "before": "reimplementation-captures/before/export-v14.png",
    "after": "reimplementation-captures/after/export-v14.png",
    "tasks": "R5-04",
    "note": "확정본 v14. 미승인 제외·미리보기·저장/복사를 비교."
  }
];
