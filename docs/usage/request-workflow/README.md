# 요청·검토 흐름 네이티브 화면

2026-11-05 · 합성 문서와 가짜 공급자를 사용하는 실제 macOS Tauri 앱에서 캡처했다. 과거 `images/`, `ux/`와 [1차 구현 캡처](archive/1c063d0a63c3ad9d/README.md)는 보존한다.

[manifest.json](manifest.json)에 제품 소스·실행 파일 해시, 빌드 ID, 촬영 시각(UTC), 이미지 해시·픽셀 크기와 실제 측정 자료를 연결했다. 창 크기는 외부 창 기준이고 CSS viewport와 배율은 측정 JSON을 따른다. 사용자가 현재 화면에서 가능한 검사만 진행하도록 지정했다. 큰 창은 macOS 제한으로 실제 1440×892까지 확인했으며, 파일명의 1440은 요청한 폭이다. 각 측정의 `actualWindow`와 viewport가 실제 크기이며 정확한 1440×900 검사는 미확인이다.

| 화면 | 캡처 |
| --- | --- |
| 첫 확인 취소 뒤 같은 작업에서 이어 쓰기 | [요청 작성](first-request-1440-1.png) |
| 선택한 후보의 변경 질문 | [후보 질문](proposal-question-1440-1.png) |
| 변경 단위 전체의 질문 | [단위 질문](unit-question-1440-1.png) |
| 선택 변경 본문과 결정 | [1280×800·100%](unit-1280-1-selected.png) |
| 짧은 삭제·추가와 결정을 함께 읽기 | [800×600·200%](short-review-800-2.png) |
| 등록 오류·재시도 | [800×600·200%](unit-800-2-error.png) |
| 처리한 변경 읽기 | [800×600·200%](unit-800-2-processed.png) |
| 실제 결정 수와 완료 | [검토 완료](completed-1440-1.png) |
| 본문 클릭 취소 뒤 같은 원문 초안 이어쓰기 | [원문 이어쓰기](followup-source-resumed.png) |
| 후보 확인 해제 뒤 같은 대상의 지시 복원 | [후보 이어쓰기](followup-candidate-resumed.png) |
| 클릭 취소의 저장 실패·복구 | [입력 보존](followup-dismiss-save-failed.png) |
| 모델 변경 뒤 최신 설정으로 재확인·전송 | [모델 재확인](followup-model-renewed.png) |

일반 요청·후보 질문·단위 질문·완료와 짧은 변경의 3개 창 × 3개 배율 측정은 각 `*-layout.json`에 보관한다. 짧은 변경은 삭제·추가 문장 전체 읽기와 결정 버튼 hit를 함께 검사했다. 변경별 본문·코멘트·등록 오류·처리 기록 및 긴 선택 수정의 전체 격자는 `apps/desktop/.artifacts/unit-review/after`, `.artifacts/ux`에서 재현한다. 작은 창의 긴 입력·오류는 해당 영역을 스크롤해 확인한 상태다.

[1차 기록](../../development/request-workflow-implementation.md)과 [보완 기록](../../development/request-workflow-followup.md)에 자동 검사와 수동 인수 범위를 구분했다. 초보 작성자 과업(AC15)과 실제 한글 IME·VoiceOver(AC16)는 미실행이다.
