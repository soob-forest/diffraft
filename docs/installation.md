# 설치와 데이터 보존

DocReview는 macOS용 로컬 Markdown 편집·검토 앱이다. 사용 방법은 [화면별 안내](../README.md#앱-사용법)를 참고한다.

## 지원 환경과 제한

- 대상 환경은 macOS 14 이상·Apple Silicon이며 Windows·Intel Mac은 지원 범위에 포함하지 않는다.
- 최소 기준은 M1·8 GB·로컬 SSD다. 해당 최소 장치의 실측은 없으며 현재 검증 환경은 macOS 26.2·Apple Silicon·36 GiB다.
- 로컬 편집·비교·저장·복원·내보내기는 AI 로그인 없이 사용할 수 있다. AI 요청에는 인터넷과 별도로 설치한 공식 native Claude Code가 필요하다.
- CLI는 2.1.295 이상 정식 버전과 필수 실행 옵션·공식 서명을 확인한다. 공식 claude.ai·firstParty 인증의 Pro·Max·Team·Enterprise 식별자를 허용하며 실제 접근 권한과 한도는 CLI가 판정한다. 별도 API 과금 경로로 자동 전환하지 않는다.
- 앱 내부 버전은 백업을 대신하지 않는다. 로컬 디스크를 사용하며 네트워크 드라이브의 저장 보장은 제공하지 않는다.

GitHub 설치 파일은 아직 게시하지 않았다. 설치 파일은 [Releases](https://github.com/soob-forest/diffraft/releases)에 별도로 제공하며, 소스를 받은 경우 아래 방법으로 직접 만든다.

## 설치 파일 만들기

[개발 환경](../apps/desktop/README.md#준비)을 준비한 뒤 `apps/desktop`에서 실행한다.

```sh
npm ci
npm run native:bundle:internal
```

생성 경로는 `apps/desktop/src-tauri/target/release/bundle/`이다.

- 앱: `macos/DocReview.app`
- 설치 이미지: `dmg/DocReview_0.1.0_aarch64.dmg`

이 명령은 최적화된 arm64 앱과 DMG를 만들고 실행 파일 목록·메타데이터·서명·아키텍처·테스트 코드 제외를 검사한다. 빌드 도구는 `APPLE_` 환경 변수를 전달하지 않으며 ad-hoc 서명만 사용한다. Developer ID 서명·Apple 공증을 받은 정식 배포본은 아니다.

## 설치와 실행

1. 생성한 DMG를 열고 `DocReview.app`을 사용할 Applications 폴더로 복사한다.
2. 앱을 실행하고 `새 문서` 또는 `문서 열기`로 시작한다.
3. AI가 필요하면 공식 Claude Code에서 로그인한 뒤 앱의 `AI 연결 설정 → 상태 다시 확인 → 연결 테스트`를 실행한다.

운영체제의 보안·파일 접근 확인창은 해당 앱과 선택한 문서 범위에서 처리한다. [Tauri macOS 서명 안내](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)를 참고한다.

## 데이터 보존과 앱 교체

현재 종료 크래시 수정본의 설치 경로·실행 파일 해시는 [새 빌드 기록](development/quit-crash-build.json)에 있다. 앱 버전이 같은 `0.1.0`이어도 내용이 다른 빌드일 수 있다. `/Applications/DocReview.app`과 `~/Applications/DocReview.app`을 혼동하지 말고, 교체한 경로의 앱을 직접 실행한다. 디자인은 [TO-BE/변경 전/구현 후 비교](design/tobe-implementation.html)를 따른다. 오른쪽 작업 선택·요청/변경 상세와 하단 버전 기록이 현재 배치이며 이전 재구현 자료는 이력이다. 종료 크래시의 수정·검증 상태는 [작업 기록](development/quit-crash-fix.md)을 확인한다.

요청·코멘트의 미제출 세션 초안은 앱 종료 후 복원되지 않는다. 필요한 초안을 별도로 보관하고 정상 종료한 뒤 앱을 교체한다. 원문 저장·확정본·작업 이력과 세션 초안을 구분한다.

앱의 버전·작업·코멘트·대화·저장 저널은 다음 위치에 보관한다.

```text
~/Library/Application Support/local.diffraft.docreview/
```

직접 연 `.md`는 선택한 원래 경로를 작업 파일로 사용한다. 새 문서는 앱의 로컬 작업 공간에 생성한다. CLI 자체 세션 기록과 앱의 DB는 별도 저장 대상이다.

1. 앱을 정상 종료하고 저장이 끝났는지 확인한다.
2. 위 앱 데이터 폴더와 작업 중인 `.md` 파일을 함께 백업한다.
3. 기존 앱을 새 `DocReview.app`으로 교체한다.
4. 다시 실행해 문서·작업·버전 기록을 확인한다. macOS가 문서 폴더 접근을 다시 물으면 확인 후 진행한다.

DB schema는 6이며 schema 5에서 변환할 때 먼저 `workspace.schema-*.backup.sqlite3`를 만든다. 더 최신 schema를 이전 앱으로 열면 쓰기를 차단한다. 복구는 앱이 종료된 상태에서 일치하는 앱·DB·문서 백업을 함께 사용한다.

저장 오류·외부 파일 변경이 있으면 앱의 `파일 비교·복구`를 사용한다. 작업 파일이나 DB를 직접 덮어써 복구 상태를 지우지 않는다. 강제 종료 전 아직 저장되지 않은 마지막 입력까지 보존한다고 보장하지 않는다.
