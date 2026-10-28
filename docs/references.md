# 공식 참고 자료

DocReview의 제품 동작과 기술 구조를 설명하는 참고 자료다. 외부 제품의 설명과 이 앱의 설계 선택은 구분하며, 실제 사용은 설치된 버전과 계정 조건을 확인한다.

## 문서 편집과 검토 UX

| 공식 자료 | 참고한 부분 |
| --- | --- |
| [VS Code 변경 검토](https://code.visualstudio.com/docs/sourcecontrol/staging-commits) | 인라인/나란히 비교·변경 탐색·구간별 행동 |
| [GitHub 변경 리뷰](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request) | 삭제·추가 줄과 코멘트·제안 검토 |
| [Google Docs 수정 제안](https://support.google.com/docs/answer/6033474?hl=en) | 승인 전 원문 보존·개별/전체 결정 |
| [Obsidian 편집과 읽기](https://obsidian.md/help/edit-and-read) | 원문 편집과 서식 미리보기 구분 |

## CLI와 인증

- [Claude Code 인증](https://code.claude.com/docs/en/authentication)
- [Claude 플랜과 프로그램 호출](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Claude Code CLI 참조](https://code.claude.com/docs/en/cli-reference)
- [프로그램 실행과 구조화 응답](https://code.claude.com/docs/en/headless)
- [문맥 관리](https://code.claude.com/docs/en/context-window)
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)

앱은 수정하지 않은 공식 CLI와 사용자 본인의 인증 흐름을 사용한다. 버전·옵션·서명·공식 구독 경로는 실행 시 진단하며 인증값을 수집하거나 다른 과금 경로로 자동 전환하지 않는다.

## 편집기·앱·자동화

- [CodeMirror](https://codemirror.net/)
- [CodeMirror merge 참고 API](https://github.com/codemirror/merge) · [이전 저장소](https://code.haverbeke.berlin/codemirror/merge)
- [Tauri 프로세스 모델](https://v2.tauri.app/concept/process-model/) · [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/)
- [WebdriverIO Tauri 플랫폼 지원](https://webdriver.io/docs/desktop-testing/tauri/platform-support) · [플러그인 설정](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup)

정확한 패키지 버전은 [package.json](../apps/desktop/package.json)·[Cargo.toml](../apps/desktop/src-tauri/Cargo.toml)과 lockfile을 따른다. 제품 diff는 Rust 계산 결과를 CodeMirror에 표시하며 merge 패키지에 승인 권한을 맡기지 않는다. WDIO는 테스트 전용 빌드에서만 사용한다.

자동 의미 병합, 무제한 대화 기억, 고정 조건의 완벽한 준수, 외부 편집기의 완전한 서식 호환성을 보장하지 않는다. 실제 검사의 범위와 한계는 [테스트 안내](development/testing.md#검증-범위와-한계)에 있다.
