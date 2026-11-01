# Codex 지침 격리·설정·계정 표시 보완 — 2026-10-31

## Problem 1-Pager

| 항목 | 내용 |
| --- | --- |
| 배경 | 이전 복구 보완 후 경계 검토에서 세 결함을 합성 테스트로 재현했다. |
| 문제 | 사용자 model_instructions_file 내용이 추론 요청에 유입된다. 저장된 reasoning이 제거되면 같은 모델을 재저장할 수 없다. 새 계정에 연결이 없어도 이전 계정의 CONNECTED 상태를 표시한다. |
| 목표 | 새 thread와 재개 모두 앱의 기본 지침을 명시한다. 지원되는 기존 선택을 보존하면서 미지원 추론 수준은 명시적 저장으로 복구한다. 세션 상태는 마지막으로 확인한 실행 계정 범위에서 조회한다. |
| 비목표 | 인증·전역 설정 변경, 자동 모델/추론 수준 교체, 대화 삭제, DB 마이그레이션, UI 재설계. |
| 제약 | 기존 Claude·승인·저장 동작을 보존한다. 파일/본문·인증값·원문 오류를 로그에 남기지 않는다. 가짜 서버·별도 DB·빈 임시 홈과 로컬 수신기로 검증한다. |

## ADR-CODEX-009: 상속된 기본 지침 차단

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 사용자 설정 파일의 경로를 찾아 읽기 차단 | CLI 기본 지침을 유지한다 | 설정 계층·별칭·기존 thread에 저장된 기본 지침까지 추적해야 한다 | 보류 |
| thread 시작·재개에 앱 소유 baseInstructions 명시 | 설정 및 기존 thread의 기본값에 의존하지 않는다 | 실제 재개·추론 요청에서 덮어쓰기를 입증해야 한다 | 채택 |

기존 developerInstructions·AGENTS/스킬 격리·도구 제한을 유지하고, 기본 지침도 앱이 소유한다. instructionSources가 비어 있다는 응답만으로 차단 성공을 판단하지 않는다. 설치된 0.165.0의 실제 App Server 추론 요청에서 합성 외부 표식의 부재와 앱 지침의 존재를 확인한다. 기존 사용자 지침으로 만들어진 thread의 재개도 별도로 검증한다.

영향도: Codex thread 인자 생성과 해당 계약/격리 테스트에 한정한다. 사용자 인증과 설정 파일은 변경하지 않는다. 검증되지 않은 자동 thread 교체는 추가하지 않는다.

## ADR-CODEX-010: 같은 모델의 추론 수준 복구

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 목록 조회마다 모델 기본 reasoning으로 교체 | 구현이 작다 | 지원되는 저장값도 바뀌고 명시적 저장 계약을 위반한다 | 제외 |
| 지원 목록을 UI에 전달하고 미지원 저장값만 복구 대상으로 표시 | 기존 선택을 보존하고 같은 모델로 복구할 수 있다 | IPC 계약과 선택 비교·안내를 함께 갱신해야 한다 | 채택 |

목록 조회는 저장값을 바꾸지 않는다. 지원되는 저장 reasoning은 목록의 기본값과 달라도 유지한다. 현재 모델의 저장 reasoning이 미지원이면 저장 후 적용할 기본값을 안내하고 모델 저장을 활성화한다. 실제 저장은 기존 모델 저장 버튼으로만 수행한다. 설치된 Impeccable의 Operate·craft-floor 기준으로 기존 UI의 위계와 상태 표현을 유지한다.

영향도: Codex 모델 목록 IPC에 지원 reasoning 목록을 추가하고, 선택 계산·저장 버튼·설명 및 생성 계약을 갱신한다. 요청에 고정된 모델과 기존 재시도는 변경하지 않는다.

## ADR-CODEX-011: 계정별 세션 상태

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 연결이 존재하는 행 중 가장 최근 실행을 선택 | 기존 쿼리를 유지한다 | 새 계정에 연결이 없으면 이전 계정으로 되돌아간다 | 제외 |
| 마지막 실행의 계정 범위를 먼저 선택한 뒤 연결 조회 | 실제 실행과 표시 범위를 일치시킨다 | 아직 실행 계정이 확인되지 않은 경우는 추정할 수 없다 | 채택 |

표시는 마지막으로 기록된 Codex 실행의 계정 범위에 한정한다. 그 범위에 연결이 없으면 LOCAL, 유실된 연결이면 MISSING이다. 다른 계정·작업의 연결을 대체 조회하지 않는다. 인증 검사 전에 실패하여 새 계정 범위를 확인하지 못한 경우는 마지막으로 확인한 실행 범위를 유지한다.

영향도: 로컬 대화 조회의 Codex 세션 상태 SQL과 회귀 테스트에 한정한다. 실제 thread 선택·대화 내용·Claude 세션은 변경하지 않는다.

## 태스크

- [x] S1: 기본 지침 상속의 영구 실패 회귀와 새 thread/기존 thread 재개 격리 구현.
- [x] S2: 지원 reasoning 전달·기존 유효값 보존·같은 모델의 명시적 복구 및 UI 검증.
- [x] S3: 마지막 실행 계정의 LOCAL/MISSING/CONNECTED 표시와 작업 격리 회귀.
- [x] S4: 전체 자동 검사·관련 네이티브 E2E·일반 앱 복원·테스트 코드 제외 확인과 기록.

검증 가정: 기존 재현 로그는 `/tmp/diffraft-review-codex-instructions.log`, `/tmp/diffraft-review-codex-edges.log`, `/tmp/diffraft-review-effort-ui.log`다. 이번 수정은 제품 코드 변경 전에 영구 테스트로 실패를 다시 확인한다. 실제 계정의 사용량을 소비하는 생성 대신 로컬 추론 수신기로 전송 문맥을 검증한다.

## 실행 기록

영구 테스트의 변경 전 실패: `codex_instructions_native`의 새 thread·기존 thread 재개 2개 모두 외부 표식 유입으로 실패했다. `codex_session_state`는 계정 B에 연결이 없는데 A의 CONNECTED를 반환해 실패했다. 앱 E2E는 같은 모델 reasoning 저장 버튼이 비활성화되어 실패했다. 로그는 `/tmp/diffraft-settings-{instructions,session}-red.log`, `/tmp/diffraft-settings-ui-red.log`다.

S1: 공통 thread 인자에 앱 소유 baseInstructions를 명시했다. 새 thread·과거 지침으로 생성한 thread의 재개, model_instructions_file와 이전 별칭 모두 실제 추론 요청에서 외부 표식 부재와 앱 지침 존재를 확인했다. 사용자 설정 파일은 변경하지 않는다. native 격리·도구 검사는 공통 로컬 수신기/프로세스 도우미로 중복을 줄였고 지침·스킬·도구 제한 5개를 함께 통과했다.

S2: 모델 목록에 supportedEfforts를 포함하도록 Rust 계약을 확장하고 TypeScript를 재생성했다. 같은 모델의 미지원 저장값만 복구 대상으로 표시하고, 지원되는 저장값은 기본값과 달라도 보존한다. 변경할 기본값·명시적 저장 안내와 버튼 설명 연결을 기존 Impeccable Operate UI에 반영했다. 순수 선택 계산 5개를 포함한 TypeScript 89개가 통과했다.

S3: 마지막 실행의 account_scope를 먼저 구한 뒤 동일 task·scope의 상태만 조회한다. 연결 없는 계정 B, B의 MISSING, A로 재전환한 CONNECTED, 다른 작업의 새 실행 및 동일 시각의 순서를 회귀 테스트 2개로 통과했다. 범위 확인 이전의 실패에서는 마지막으로 확인된 실행 범위를 사용하는 기존 제약을 기록했다.

## 최종 검증 — S1~S4 완료

| 검사 | 결과 |
| --- | --- |
| `native:test` | 307개 통과, 기본 ignored 22개. workflow 139개 포함 |
| 설치 CLI 격리 계약 | `codex_instructions_native` 2·`codex_isolation` 2·`codex_tools` 1 = 5개 통과. 합성 홈·로컬 수신기, 계정 불필요 |
| `test:unit` | TypeScript 89개·종료 관측기 4개 통과 |
| `typecheck`, `lint`, `native:check`, `native:fmt`, `contracts:check`, `build` | 통과, 신규 경고 없음 |
| 합성 네이티브 E2E | Codex 13·connection 4·generation 5·regeneration 5·rewrite 7·model-selection 5 = 39개 통과 |
| Impeccable | Operate·craft-floor 적용. 소스 발견 0개. 두 창 크기·세 배율에서 가로 넘침 없음·저장 버튼 도달·새 안내와 포커스 설명 연결 확인 |
| `native:build` | 일반 앱 복원 완료. 바이너리·프런트엔드에서 WDIO·E2E IPC·fixture·전용 환경변수·새 격리 표식 부재 확인 |

화면은 `.artifacts/codex/reasoning-repair-{1440,800}-{1,1.5,2}.png`에 저장했다. 일반 화면과 가장 좁은 확대 화면을 직접 검토하여 변경할 기본값과 저장 행동이 읽히는지 확인했다. 소스 검사 결과는 `impeccable-settings-source.json`이다. 새 안내의 DOM 포커스·aria-describedby 연결을 검사했으며 기존 OS 키보드 검증은 이전 기록을 따른다.

로그: `/tmp/diffraft-settings-*.log`, 일반 앱 제외 검사: `/tmp/diffraft-settings-product-exclusion.json`. 검증 CLI는 0.165.0이다. 실제 계정의 사용량을 소비하는 생성은 이번 보완에서 반복하지 않았다. 기존 사용자 문서·전역 설정·로그인은 변경하지 않았다.
