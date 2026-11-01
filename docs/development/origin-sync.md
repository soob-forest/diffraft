# origin 통합·커밋 기록 — 2026-11-01

## Problem 1-Pager

| 항목 | 내용 |
| --- | --- |
| 배경 | 로컬 Codex 구현·복구·정리가 검증된 상태에서 origin 반영과 GitHub push를 요청받았다. |
| 문제 | origin/main의 Claude 기본 Opus·네이티브 검사 변경이 로컬 공급자 모델 계약 및 문서·E2E와 겹친다. |
| 목표 | 원격 변경과 로컬 기능을 함께 보존하고 충돌을 해결한 뒤 검사·커밋·push한다. |
| 비목표 | 인증 변경, 실제 계정 호출, 원격 이력 재작성, TODO.md·SPEC.md 및 기존 로컬 도구 설정 커밋. |
| 제약 | 충돌 파일과 호출 경로 전체를 읽는다. 원문·저장 요청·공급자·모델 고정 및 테스트 격리를 유지한다. |

## ADR-CODEX-013: 원격 변경 통합

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 로컬 변경을 먼저 커밋한 뒤 rebase | 작업 내용을 커밋으로 보존한다 | pull 이전 커밋이 되고 사용자 요청 순서와 다르며 충돌 수정이 별도 필요하다 | 제외 |
| 구현 경로만 임시 stash 후 fast-forward pull·stash apply | pull 후 최종 통합 결과를 검토하여 커밋할 수 있다 | stash 적용 시 텍스트·타입 충돌을 직접 해결해야 한다 | 채택 |

TODO.md·SPEC.md·.cursor/hooks.json·.gemini/settings.json은 원격 변경과 겹치지 않으므로 작업 트리에 유지하고 전후 해시를 확인한다. stash는 적용 후에도 커밋·push 확인 전까지 보존한다. 원격 이력은 fast-forward로만 반영하고 일반 push를 사용한다.

가정: origin/main의 Claude 미설정 기본 Opus와 실계정 검사 기록은 의도된 원격 변경이다. 기존 저장 선택·모델 없는 과거 요청의 cli_default 해석과 로컬 신규 데이터의 Codex 기본 공급자는 함께 유지한다. 원격 실계정 검사 기록은 이번 통합에서 재호출한 증거로 취급하지 않는다.

영향도: 겹치는 README·테스트 안내·모델 선택 E2E를 병합하고, 원격 네이티브 테스트를 현재 ProviderModel 요청·실행 기록 계약에 맞춘다. 실제 계정 검사는 ignored 상태로 유지하며 제품 인증·생성 동작은 바꾸지 않는다.

커밋 범위: 공급자 타입·Rust IPC·생성 계약·프런트엔드를 계층별 커밋으로 나누면 중간 리비전의 계약이 어긋난다. 함께 검증된 기능·테스트·필수 사용 문서를 원자적으로 커밋하고, 계획·ADR·검증 기록은 별도 문서 커밋으로 분리한다.

검사 중 발견: 확대 화면의 WDIO Actions `scrollIntoView`가 30초간 응답하지 않아 복구 사례와 그 뒤 두 사례가 실패했다. 같은 코드의 복구 검사만 다시 실행하면 네 사례가 16.6초에 통과했다. 원격 제품 변경과 무관한 검사 드라이버의 간헐 정체로 판단한다. 시간 제한을 늘리면 정체를 허용하게 되므로, 기존 화면 치수 측정의 browser.execute 안에서 DOM scrollIntoView를 먼저 실행한다. 실제 레이아웃·가시성·저장·복구 검증은 그대로 유지한다. 영향은 captureLayouts를 사용하는 두 E2E 파일에 한정하며 전체 Codex E2E를 다시 검사한다.

## 진행

- [x] 구현 경로 보존 후 `git pull --ff-only origin main`.
- [x] 텍스트 충돌과 모델 계약의 의미상 충돌을 해결하고 관련 검사를 실행.
- [x] TODO·SPEC·로컬 도구 설정을 제외하고 구현 변경 검토·커밋.
- [x] 일반 앱 복원·테스트 코드 제외 및 커밋 제외 파일 보존 확인.

## 통합·검증 결과

origin pull은 `2a4f6dd → 97190a9`로 fast-forward했다. README의 충돌은 Codex 설명과 Claude 기본 Opus를 함께 유지하여 해결했다. 자동 병합된 모델 선택 E2E의 작업 선택기 대기와 테스트 안내의 원격 네이티브 검사 설명도 보존했다.

원격 네이티브 검사 도우미는 ProviderModel 계약과 맞지 않아 네 컴파일 오류로 실패했다. 요청 생성·검증에 기존 Claude 변환을 적용해 명시된 Claude 모델과 실행 기록을 유지했다. 변경 후 관련 12개 자동 검사와 전체 Rust 검사가 통과했다.

구현 커밋은 `0f5d3a6`이다. 계획·ADR·검증 기록은 별도 문서 커밋으로 분리한다.

| 검사 | 결과 |
| --- | --- |
| `npm run native:test` | Rust 313개 통과·명시 실행용 30개 ignored |
| `npm run test:unit` | TypeScript 89개·종료 관측기 4개 통과 |
| typecheck·lint·native:fmt·native:check·contracts:check·build | 통과·경고 없음 |
| 네이티브 E2E | model-selection 5개·connection 4개·Codex 13개, 총 22개 통과 |
| 화면 스크롤 검사 보완 | 초기 정체 로그를 보존하고 수정 후 Codex 전체 13개를 다시 통과 |
| `npm run native:build` | E2E 이후 일반 앱 복원 완료 |
| 일반 앱·웹 산출물 | 테스트 IPC·가짜 CLI·WDIO 등 표식 8개 모두 제외 |
| 변경 보존 | stash 복원 당시 원격과 겹치지 않는 143개 파일의 원본 일치, 커밋 제외 네 파일의 전후 해시 일치 확인 |
| 변경 리뷰 | 병합 표시·주요 비밀값 패턴 검사 및 `git diff --check` 통과 |

로그는 `/tmp/diffraft-origin-*.log`, 제품 제외 결과는 `/tmp/diffraft-origin-product-exclusion.json`이다. 실제 계정 호출은 실행하지 않았다. 마지막 수정은 E2E 스크롤 도우미에 한정하므로 lint와 이 도우미를 사용하는 Codex E2E를 다시 검사했다.

최종 전송 절차는 검증 기록 커밋 후 `git push origin main`을 실행하고 원격 main과 HEAD를 대조하는 것이다. 임시 stash는 전송 확인 후 해당 항목만 정리한다.
