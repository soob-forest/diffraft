# Claude 모델 선택 구현·검증 기록

작성일: 2026-10-29 · 기준: [SPEC](../../SPEC.md), [TODO](../../TODO.md).

## 문제와 구현 범위

Claude CLI·계정이 없는 로컬에서도 기본 모델을 저장하고, 이후 모든 요청과 재시도가 선택값을 일관되게 사용하게 한다. 모델 권한 자동 조회·API 키·직접 API 연동·모델 품질 비교는 범위 밖이다. 실제 계정 검증(T7)은 실행하지 않는다.

설정 → 요청 준비/확인 → 요청 JSON 저장 → 공통 launcher → 실행 기록 → 완료/실패 → 저장 요청 재시도의 호출 경로를 추적했다. PATCH/EXPLAIN은 `generation/request.ts`, 재제안은 `review/useRegeneration.ts`, REWRITE/다른 방향은 `rewrite/useRewriteGeneration.ts`에서 모델을 고정한다. Rust에서는 `CliLauncher::prepare`가 저장 요청의 선택값을 읽는다.

## ADR: 대안·가정·영향

| 결정 | 대안과 장점 | 단점·위험 | 선택 |
| --- | --- | --- | --- |
| 저장 위치 | 기존 CLI 경로 설정 확장: 파일 한 개 | 필수 경로·진단과 결합하여 미설치 저장이 어려움 | 별도 `model-settings.json`: 오프라인 IPC, 두 파일의 원자적 연동은 불필요 |
| 모델 표현 | 고정 모델 ID: 재현성 | 버전 노후화·계정/조직별 차이 | enum `cli_default/sonnet/opus/haiku`; 별칭의 실제 모델은 추정하지 않음 |
| 실행값 | 실행 직전 전역 설정 읽기: 코드가 짧음 | 확인값·재시도 모델이 바뀜 | 요청 준비 시 고정하고 저장된 요청에서 실행값 조회 |
| 재제안 확인 | 즉시 실행: 클릭 감소 | 요청 모델 확인 기회 없음 | 기존 폼에서 모델과 사용량 안내 후 확인 버튼 제공 |
| 파일 동시성 | 별도 파일 잠금: 다중 작성자 지원 | 잠금 계층·교착 위험 증가 | Store의 프로세스 단일 작성자 lease + 설정 전용 mutex |
| 오류 복구 | 손상 파일 자동 초기화: 편리함 | 이전 값과 오류 증거 손실 | 덮어쓰기 거부, 원인 안내·다시 읽기/저장 제공 |
| 디자인 | 별도 모델 선택 화면: 영역 여유 | 이동·설정 중복 | 기존 연결창 확장, Impeccable Operate 및 TO-BE 유지 |

가정: 하나의 앱 데이터 폴더는 기존 Store lease가 단독으로 소유한다. 모델 선택은 요청한 별칭이며, CLI 기본값은 `--model` 생략이다. 공식 CLI의 기본 선택·정책·내부 대체는 별도 관측 대상이다.

영향: 요청 타입 세 곳과 실행 기록에 필드가 추가된다. schema 7 마이그레이션은 기존 실행에 NULL(모델 미상)을 남기며, 모델 필드 없는 과거 요청만 CLI 기본값으로 읽는다. 인증·세션·범위·원문 승인 계약은 기존 경계를 사용한다. 재시도에서 모델이 달라지면 자식 프로세스 실행 전에 거부한다.

공식 [모델 설정](https://code.claude.com/docs/en/model-config)과 [CLI 참조](https://code.claude.com/docs/en/cli-reference)를 2026-10-29 재확인했다. `--model`과 sonnet/opus/haiku 별칭의 근거이며, 특정 버전 해석·가격·이용 권한은 제품에 하드코딩하지 않았다.

## 변경 파일과 검증 경계

- `domain/model.rs`, `commands/model_settings.rs`, `claude_adapter/model_settings.rs`: 제한된 IPC·오프라인 설정. 1 KiB 상한, 0600 임시 파일, symlink/비정규 파일 거부, 동기화 후 교체, 읽기/쓰기 직렬화.
- 요청 타입·`storage/job_model.rs`·`generation_execution.rs`·`generation_completion.rs`·`007-model-selection.sql`: 요청·실행 모델, 과거 DB 업그레이드와 재시도 일치 검사.
- `profile.rs`, `diagnostics.rs`, `connection.rs`, `execution.rs`: 실제 공통 인자 생성, --model 옵션 진단과 probe, 검사한 모델이 연결 결과에 포함됨.
- `connection/ModelSettings.tsx` 및 hook/CSS: 읽기·미저장·저장 중·성공·실패·수동 복구. 미저장 연결 테스트 차단, 이전 성공 무효화.
- 요청 확인/재시도/재제안/재작성 화면: 요청 모델 표시. 기존 연결창 포커스 복귀는 반응형 사이드바가 사라졌으면 문서 목록 버튼으로 이동.
- fixture·unit·workflow·E2E: 네 모델 × 전체 생성 경로, 실제 자식 인자 검사, 설정/DB 오류, 재시작·재시도·중단·기존 데이터 보존.

## 환경과 선행 상태

초기에는 node_modules와 Rust 도구가 없었고 시스템 Node 23.11은 프로젝트 요구 버전과 달랐다. 기준 실행은 vitest 누락·npm engine 오류로 실패했다. 공식 체크섬을 검증한 Node 24.22.1/npm 11.19.1, Rust 1.99.1을 저장소 `.tools/`에 준비하고 npm ci 후 기존 단위 79개+프로세스 종료 4개 통과를 확인했다. 전역 셸 설정과 사용자 Claude 인증은 변경하지 않았다.

기존 사용자 변경 `.cursor/hooks.json`, `.gemini/settings.json`은 보존했다. npm 개발 의존성 audit의 high 13건은 기존 WDIO 전이 의존성 항목이며 `npm audit --omit=dev`는 0건이다. 관련 없는 일괄 의존성 업그레이드를 수행하지 않았다.

## 자동 검증

최종 명령과 결과는 다음과 같다. 로그와 캡처는 Git 제외 경로 `.artifacts/models/`에 보관한다.

| 검사 | 결과 |
| --- | --- |
| typecheck / lint / test:unit | 통과. Vitest 26파일·84개, 프로세스 종료 4개 |
| native:fmt / native:check / native:test | 통과. Rust 245개, ignored 11개, 실패 0 |
| contracts:check / build | 통과 |
| model-selection (별도 앱 재시작 포함) | 5개 통과. 확인·실행 중 설정 변경과 중단 경합 포함 |
| connection / generation / regeneration / rewrite | 통과 |
| export / design-resume (재시작 포함) | 통과 |
| 일반 native:build 및 테스트 코드 제외 | 통과. 실행 파일의 기존 9개 테스트 마커 모두 없음 |

합성 자식 프로세스가 예상 모델과 실제 인자를 대조한다. 누락·잘못된 값·중복·불일치 테스트는 성공 fixture만 재생하는 검증과 구분한다. 마이그레이션 테스트는 v6 실행 모델 NULL·대화 보존·백업과 v1~v5 기존 회귀 검사를 포함한다.

## Impeccable 시각 리뷰

설치된 Impeccable 4.8.0의 context(세션당 1회), Operate, craft-floor, clarify, harden, audit, polish 지침을 적용했다. 화면은 기존 TO-BE의 글꼴·색·간격·연결 상태 위계를 유지한다. 가격/품질 카드나 새 디자인 시스템을 추가하지 않았다.

소스 detect 결과는 발견 없음(`[]`)이었다. 실제 Tauri/WKWebView 캡처를 함께 검토하여 native select 높이·오류 줄바꿈·닫기 후 포커스를 보완했다. 1440×900/800×600 × 100%/150%/200%의 6개 조합에서 가로 넘침 없음, 모델 선택/저장 버튼 도달과 내부 스크롤을 확인했다. 확대 화면에서 모달 전체를 한 번에 보이도록 축소하지 않고 스크롤을 유지한다.

캡처: `settings-{1440,800}-{1,1.5,2}.png`, `settings-error.png`, `request-confirmation.png`, `model-denied.png`, `model-success.png`.

임베디드 WDIO 키 입력은 synthetic KeyboardEvent여서 실제 Tab 기본 동작을 재현하지 않는다. 2026-10-29 macOS 권한 허용 후 격리된 Tauri 테스트 앱에서 네이티브 입력 검증을 추가 완료했다. 제품 코드 수정 없이 다음 동작을 접근성 트리와 실제 화면으로 확인했다.

- Tab: 설정 닫기 → 상태 다시 확인 → 모델 선택. 미저장 선택 후 Tab으로 저장 버튼에 도달한다.
- Space/방향키: OS 메뉴에 네 선택지가 노출되고 위·아래 키로 항목을 이동한다. Enter 확정 후 Sonnet과 Haiku가 실제 선택값에 반영된다.
- Space 저장: 저장 버튼에서 실행하면 저장 완료 안내가 표시되고 버튼은 비활성화된다.
- Escape: 설정창이 닫히고 `AI 연결 설정` 버튼으로 포커스가 돌아온다.
- 작은 창: macOS Window → Move & Resize → Top Left 배치(캡처 1706×1202 물리 픽셀)에서 메뉴 마지막 Haiku까지 도달·확정·저장했다. 본문 내부 스크롤과 컨트롤 포커스 표시도 확인했다.

OS 메뉴의 네 항목은 접근성 트리와 실제 선택 동작으로 검사했다. 앱 전용 스크린샷 API에는 별도 OS 팝업 레이어가 포함되지 않으므로 해당 레이어의 픽셀 캡처는 남기지 못했다. 이 제한을 메뉴 조작 실패로 보거나 픽셀 단위 검증 통과로 확대하지 않는다. 기존 6개 크기·배율 자동 캡처는 그대로 유지한다. 이 검증은 VoiceOver 전체 감사가 아니다.

검토 점수(이번 확장 영역 한정): **9/10**. 상태 구분·기존 위계·레이아웃·오류 보존·실제 키보드/메뉴 선택·포커스 검사를 충족했다. 확인했던 포커스 복귀와 native select 높이는 수정 후 재검증했다. 실제 서비스 호환성은 아래 별도 검증 범위를 따른다.

중간 실패: 자동 select 조작이 React change를 발생시키지 않아 기존 프로젝트의 이벤트 방식으로 수정했고, 테스트 설정 경로를 `data/model-settings.json`으로 바로잡았다. 좁은 창에서 숨겨진 열기 버튼으로 포커스를 되돌릴 수 없어 보이는 문서 목록 버튼을 대체 대상으로 추가했다. synthetic Tab 테스트는 네이티브 키보드 증거로 사용할 수 없음을 드라이버 구현에서 확인했다. 성공 화면은 DB 완료만 기다리지 않고 UI 회복/처리 상태 갱신 뒤 캡처한다.

## 남은 실서비스 검증

실제 Claude 설치·계정·네트워크 요청은 수행하지 않았다. T7의 CLI 버전별 모델 권한, 실제 구조화 출력/effort 조합, 다른 모델로 세션 재개, CLI 자체 fallback, 실제 오류 형식과 60초 시간 제한은 별도 환경에서 명시적으로 검사해야 한다. 기본 ignored 실계정 테스트는 자동 검사에서 제외된다. 로컬 통과를 모든 계정의 모델 이용 가능 보장으로 확대하지 않는다.
