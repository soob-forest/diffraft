# 사용 설명 이미지

루트 [README의 앱 사용법](../../../README.md#앱-사용법)에서 사용하는 DocReview 0.1.0의 실제 macOS 앱 캡처다. 2026-10-28에 일반 문서·여행 준비 예시로 네이티브 자동 검사를 다시 실행해 촬영하고, 현재 UI와 대조한 뒤 원본 그대로 복사했다. 이미지의 글자나 화면을 편집하지 않았다.

| 파일 | 원본 산출물 (`apps/desktop/.artifacts/` 기준) | 촬영 시나리오 (`apps/desktop/tests/` 기준) |
| --- | --- | --- |
| workspace.png | local-editor.png | editor.e2e.mjs |
| ai-connection.png | connection-ready.png | connection.e2e.mjs |
| change-review.png | review-inline.png | review.e2e.mjs |
| whole-rewrite.png | rewrite-w02.png | rewrite.e2e.mjs |
| version-restore.png | restore-comparison.png | history.e2e.mjs |
| confirmed-export.png | export-v14.png | export.e2e.mjs |

문서·응답·경로는 합성 fixture다. `/synthetic/claude`는 테스트용 진단 경로이며 실제 계정 정보나 설치 위치가 아니다. UI 캡처 자체를 실제 계정의 연결·생성 성공 근거로 사용하지 않는다.

UI가 바뀌면 해당 시나리오로 합성 문서를 촬영하고 화면·버튼 이름을 확인한 뒤 이미지와 README 설명을 함께 갱신한다. E2E 빌드와 일반 앱이 같은 debug 실행 파일을 사용하므로 촬영 후에는 제품 앱 README의 안내대로 일반 빌드를 복원한다.
