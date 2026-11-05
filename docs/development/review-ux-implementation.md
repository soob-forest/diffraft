# 변경 검토 UI/UX 구현 기록

기준: [SPEC](../../SPEC.md), [TODO](../../TODO.md) · 시작: 2026-11-04

## 문제와 영향 경계

Problem 1-Pager는 SPEC 1절을 따른다. 적용·분해·후보·DB/IPC 계약은 유지하고 표시와 탐색, 코멘트의 저장 확인만 변경한다.

호출 경로:

- `DocumentWorkspace → WorkspaceBody → DocumentMain → ReviewPanel → UnitReview`.
- `UnitReview → useUnitReviewController → useUnitNavigation → SessionDrafts`.
- `UnitReviewTools / UnitReviewNavigation / UnitReviewDiff → 같은 navigation`.
- `UnitReviewDiff → 현재/원래 UnitDiff → DiffViewer → DiffPane / TextDiff`.
- `UnitReviewDetail → WorkspacePanels.detail portal → UnitComments → useUnitComment → SessionDrafts → persistence → draft transport`.
- 결정은 기존 `useReviewActions`, 의견 등록은 기존 `reviewCommand`를 통한다. 표시 변경이 이 경계를 우회하지 않는다.

사전 조건은 안정된 단위 번호·계획, 비교별 스크롤, 단위별 코멘트 초안이다. 사후 조건은 동일 필터의 선택·탐색, 표시 projection과 같은 텍스트, 실제 입력의 저장 확인이다.
공유 DiffViewer·장식·초안 경계 변경은 PATCH/WHOLE, 선택 수정, 복구 회귀에 영향을 주므로 해당 기존 검사를 함께 실행한다.

## UX-01 배치와 스크롤 결정

기준 화면은 기존 네이티브 캡처 `.artifacts/unit-review/1280-1.png`다. 이는 일부 처리 후 선택 위치로 스크롤한 화면이며 초기 화면으로 간주하지 않는다.
2026-11-04 새 baseline 실측: OS 창1280×800, 실제 뷰포트1280×768, zoom100%, DPR2. 문서 도구77px·모드바48px, 검토 도구194px·피드백36px·비교 레이블57px, 실제 diff228px였다. 새 결과는 새 소스의 네이티브 측정으로 검증한다.

| 상태 | 핵심 영역 | 보조 영역 / 본문 |
| --- | --- | --- |
| 미처리 | 선택 제목/번호, 이전·다음, 대상별 거절·승인, 코멘트 | 짧은 진행/필터, 검토 도구, 비교 기준, diff |
| 긴 제목 | 한 줄 선택기와 별도 포커스 제목 | 전문·종류·상태·결합 이유는 변경 정보에 펼침 |
| 결합 단위 | 같은 고정 번호·결정 | 모든 범위 좌측 표식·범위 시작 번호, 관련 위치 이동 |
| 빈 필터 / 완료 | 선택 없음, 비활성 탐색 / 완료 포커스 | 필터 변경 경로 유지, 자동 전체 대체 없음 |
| 처리 기록 | 고정 번호·읽기 전용, 재검토 가능한 거절 | 원래 전체 후보, 현재로 복귀 |
| 코멘트 | 대상 제목, 단위 전체 입력, 저장과 상태 요약 | 좁은 창은 본문/작성 왕복, 초안·선택·위치 보존 |
| 오류 | 같은 대상·입력, 구체적 원인과 복구 | 상시 일반 안내로 성공을 약속하지 않음 |

스크롤 소유권은 평상시 diff의 CodeMirror scroller, 작성 패널은 workspace-panel이다. 핵심 도구는 본문과 별도 flex 영역으로 유지하여 diff 스크롤에 따라 사라지지 않는다.
유효 높이가 작은 화면은 문서 헤더를 먼저 스크롤할 수 있는 검토 전용 구조를 사용하되 핵심 결정 영역을 상단에 유지한다. 팝업은 스크롤 컨테이너 밖 top layer에 표시한다.
기존 단일 패널 임계값 720 CSS px를 유지한다. 중앙 영역 자체가 좁을 때는 선택과 결정 두 줄을 허용하고 설명·보조 정보부터 접는다. 본문 16px·행간 1.8은 유지한다.
목표는 넓은 창의 핵심 영역 두 줄 이내, 대표 수정의 삭제·추가와 결정 동시 가시성이다. 픽셀 높이는 실제 측정 결과로 기록하고 긴 콘텐츠에 고정 높이를 강제하지 않는다.

## 대안과 적용

SPEC ADR-REVIEW-001~005를 따른다. 추가 구체화:

| 결정 | 대안 A: 장점 / 단점·위험 | 대안 B: 장점 / 단점·위험 | 선택 |
| --- | --- | --- | --- |
| 비교 데이터 전달 | 부모로 원래 비교 이동: 옵션 연결 쉬움 / 캐시·로딩 소유권 확장 | 같은 DiffViewer 안에 TextDiff: 같은 projection 보장 / 직접 진입 배치 필요 | B |
| 초안 확인 | flush 성공만 기록: 수정 작음 / 자동 저장·다른 key 실패·새 입력과 혼동 | persistence의 key별 성공 값 확인: 실제 응답과 연결 / 공통 테스트 보강 | B |
| 작은 높이 | 본문 최소 높이만 증가: 읽기 공간 확보 / 결정 도구가 화면 밖 | 검토 전용 스크롤·고정 도구: 맥락 유지 / 실제 확대 검증 필요 | B |
| 대체 읽기 공간 | 시각·텍스트를 위아래 분할: 단순 / 확대 시 두 영역 모두 좁음 | 텍스트를 열면 같은 영역에서 대체 읽기: 공간 확보 / viewer DOM·위치 유지 필요 | B, CHANGES에 한정 |
| 재검토 선택 | 옛 projection으로 즉시 정규화: 단순 / 재검토 단위가 필터 밖으로 제거됨 | 새 회차 PENDING 확인 후 선택: 대상 일치 / 다른 창의 선행 처리 시 intent 취소 필요 | B |
| 관련 위치 | 모든 위치 버튼 나열: 직접 접근 / 긴 결합 단위에서 본문을 밀어냄 | 고정 번호의 위치 선택기·이동: 모든 위치 접근 / 현재 위치 표현 필요 | B |
| 팝업 크기 변경 | 재측정: 맥락 유지 / 관찰 코드 확대 | 닫고 진입점 복귀: 단순 / 다시 열기 필요 | B |
| 낮은 높이의 핵심 도구 | 기존 flex 유지: 단순 / 확대 시 여러 행이 본문을 점유 | 400 CSS px 이하 두 행 grid: 본문 확보 / 진행 전문의 도구 내 제공 필요 | B |
| 긴 본문 줄바꿈 | 편집기 재생성: 재측정 / 선택·스크롤 초기화 위험 | 내부 content flex 최소 폭 0: 기존 줄바꿈 사용 / 확대 실측 필요 | B |
| 관련 위치 이동 | 문단 시작: 단순 / 미변경 문맥만 보여 변경은 화면 밖 | 요청 범위의 첫 실제 변경 행: 대상 명확 / 표시 행 탐색 필요 | B |
| 코멘트 진입점 | 공통 panel API에 명시적 entry 인수 추가: 모든 호출에서 확정 / 공유 계약·호출 범위 확대 | 코멘트 클릭 시 버튼 포커스 후 기존 entry 캡처: 작은 변경 / WebKit 실제 Esc 회귀 필요 | B |
| 이동 뒤 범위 번호 | 본문 커서만 nearest: 기존 방식 / 긴 행에서 번호가 바로 위로 가려짐 | CHANGES jump에 heading 여백 명시: 번호·첫 본문 동시 확인 / 작은 높이 native 검증 필요 | B, 다른 비교의 jump는 유지 |

가정: 원래 후보의 본문은 batch 생명주기 동안 불변이므로 성공 캐시는 유지한다. 현재 결정 상태는 최신 navigation에서 읽고 캐시된 결정 상태로 행동을 허용하지 않는다.
가정: 저장 확인은 JS persistence의 성공 응답/복원 값과 현재 입력의 동일성을 사용한다. DB 스키마·debounce·CAS 정책을 변경하지 않는다.
가정: 낮은 높이의 진행·피드백은 접근성 트리에 유지하고 전문을 검토 도구에서 확인한다. 텍스트 읽기 진입은 비교 기준 행에 함께 둔다. 본문 16px는 유지하며 내부 scroller의 실제 높이 80px를 확보하기 위해 가로 스크롤바까지 포함한 외곽 최소 높이는 82px로 둔다. 포커스 정렬은 workspace.scrollTop만 변경하며 문서 전체를 스크롤하지 않는다.
영향: 긴 내용의 flex 최소 폭은 CHANGES 내부에만 적용한다. 위치 이동은 표시 selection만 변경하고 저장된 연산·바이트 적용 범위는 변경하지 않는다. 위치 helper 회귀는 미변경 문맥·요청한 결합 범위·없는 범위를 포함한다.
영향: WebKit의 포인터 클릭이 버튼에 포커스를 주지 않아 기존 panel entry가 이전 탐색 버튼으로 남는 경우를 실제 Tab→코멘트→Enter→Esc로 재현했다. 코멘트 진입 전에 실제 버튼을 포커스하여 공통 panel 복귀와 입력의 Esc 복귀가 같은 진입점을 사용하게 한다. 다른 panel 호출은 변경하지 않는다.
가정: 기존 범위 제목은 42.4px이며 CHANGES의 명시적 이동은 제목과 기본 커서 여백을 합친 48 CSS px를 확보한다. 원래 후보 자동 이동의 focus=false는 유지한다. 관련 위치1의 번호 가림은 `.artifacts/review-ux-e2e-main-display.log`에서 먼저 실패했다. 같은 native 검사를 회귀로 유지한다.

## 실행 증거

- 시작 검사: `typecheck`, `lint` 통과. `test:unit` 프런트엔드 176개 및 Node 9개 통과.
- UX-02: `native:build:e2e` 성공. `test:e2e -- rewrite-review` 기존3개 통과·신규4개 예상 실패. 확정 로그 `.artifacts/ux02-baseline-e2e-confirmed.log`, 세부 `.artifacts/unit-review/ux02-*.json/png`. 필터 실제값 processed를 확인한 뒤 빈 목록의 활성 결정/이동, 필터 밖 선택, 초안 대상 미이동, 시각20분/텍스트누락을 재현했다.
- 최초 WebDriver 세션 종료와 change 이벤트가 전달되지 않았던 앞선 시도는 회귀 근거에서 제외했다.
- UX-03: 제목/선택기 통합, 핵심 결정·진행 분리, 도구 top-layer 팝오버, 낮은 높이의 검토 전용 스크롤 구조 적용. TypeScript 검사 통과. 실제 배치 인수는 최종 새 캡처로 판정한다.
- UX-04/05: 모든 연속 범위의 시작 번호·좌측 표식, 대상 번호를 포함한 결정 버튼, 실제 변경 텍스트와 workspace clip 기준의 화면 밖 안내를 적용했다. 필터의 안정된 번호 순회·빈 결과·구형 초안 정규화·재검토 회차 선택과 다른 창의 선행 처리 시 intent 취소를 순수 회귀로 검사했다.
- 경계 수정 전 실패: `.artifacts/ux05-boundary-before.log`(빈 clip·옛 재검토 projection), `ux05-reopen-race-before.log`(재검토 후 다른 창 처리). 수정 후 관련 회귀 통과.
- 2026-11-04 전체 `typecheck`, `lint`, 프런트엔드211개·Node9개, 웹 빌드 통과. 일반 웹 빌드는 index503.37kB의 번들 크기 권고 경고가 있다. 로컬 앱 번들 특성을 고려해 이 UX 작업에서 임의 분할·경고 임계값 변경을 하지 않았으며 마지막 일반 빌드에서 다시 기록한다.
- 첫 native 실행: 필터3건·원래 텍스트 불일치 회귀 통과. 팝업 내부 제어의 WebDriver 확대 스크롤과 400×284의 코멘트 입력 가림을 발견했다. 팝업 검사는 DOM 스크롤 후 실제 hit/완전 가시성을 그대로 검사하고, 패널은 입력 포커스가 있는 실제 패널을 작업 영역 상단으로 정렬하도록 보완했다.
- 두 번째 native 실행: 팝업과 코멘트9조합 통과. 본문 복귀 후 제목 표식만 보이고 실제 변경 텍스트가 footer 뒤일 때의 판정 차이를 발견해 실제 텍스트 Range를 사용하도록 수정했다. 패널 닫기는 원래 진입점에 포커스를 복원한다.
- 초기 resize/렌더 대기 timeout 및 native 표시와 WebView hidden이 달랐던 실행은 제품 인수 결과에서 제외했다. 실제 창을 표시한 뒤 재검증하며 숨김 측정을 성공으로 바꾸지 않는다. 최종 결과는 아래 통합 기록을 따른다.

## UX-06 코멘트 등록과 입력 보관

배경·문제는 전역 `DraftStatus`가 해당 코멘트 입력의 저장 증거가 아니라는 점이다. 목표는 버튼 근처에서 실제 입력의 보관과 등록 단계를 구분하고 실패·재시도·늦은 응답에도 입력과 대상을 보존하는 것이다. 비목표는 DB/IPC·debounce·CAS·생성·결정 변경이다. 기존 참조 동일성 기반 `replace`와 unit별 초안 키를 유지한다.

영향: `UnitComments → useUnitComment → SessionDrafts → DraftPersistence`의 표시·저장 확인과 해당 회귀다. 저장 응답은 요청 시 캡처한 값에만 확인을 부여하고, 새 입력과 다른 key의 실패에 전파하지 않는다. 복원 성공 값은 확인하지만 격리·잠금 값은 확인하지 않는다.

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| hook의 flush 성공만 기록 | 작은 변경 | 자동 저장·복원·다른 key 실패 및 submitted/실제 write 차이를 놓침 | 제외 |
| key별 저장 확인 모듈 | 실제 write/복원 응답과 연결 | 공통 구독·회귀 보강 필요 | 채택 |

가정: 초안은 기존처럼 새 값으로 교체하며 제자리 변경하지 않는다. 별도 확인 모듈은 값의 참조만 보관하고 3 MiB payload를 복제·재직렬화·해시하지 않는다. 마지막 성공 값과 최신 시도 값만 참조한다. 등록 실패는 제출 스냅샷과 단계를 함께 보존하며, 현재 입력이 달라지면 이전 결과를 새 입력의 결과처럼 표시하지 않는다. 보관 재시도는 초안만 저장하며 등록·AI·결정을 실행하지 않는다.

저장 중 A가 새 입력 B로 바뀌고 B의 debounce가 A의 진행 중 flush에 합류한 뒤 A가 실패하는 경우도 분리한다. B를 저장 성공이나 직접 쓰기 실패로 표시하지 않고 대기 상태에 보관 중단 원인을 연결해 수동 재시도를 제공한다. 기존 자동 재시도·timer 정책은 바꾸지 않는다. 등록 응답 뒤 입력 비움의 보관이 실패해도 등록 성공과 보관 오류를 함께 표시하고 초안만 재시도한다.

검증: key별 확인 API 부재 회귀4건과 A/B debounce 후 재시도 접근 회귀1건이 수정 전 실패했다. 등록 전 flush 실패의 등록0건, 동일 ID 재시도, 늦은 응답의 새 입력 보존, 복원·잠금·다른 key 실패, 등록/보관 단계 표현을 가짜 transport·timer와 기존 DraftStore로 검사한다. 실제 앱의 포커스·창/배율·오류 배치는 UX-09/10에서 새 native 증거로 확인한다.

2026-11-04 UX-06 담당 검증: `npx vitest run`의 draft-acknowledgements·unit-comment-save·unit-comment-feedback 및 기존 persistent/session/oversized/quarantined/draft-validation/draft-decode/request-reliability/selection-draft-recovery 11파일50건 통과. 신규 검사는 16건이다. 전체 `npm run typecheck`와 담당11파일 Biome 검사 통과. 전체 lint의 남은 오류는 동시 작업 중인 `tests/support/unit-review-regressions.mjs` 포맷1건으로 이 태스크에서 수정하지 않았다. 빌드·native·E2E는 실행하지 않았다.

## UX-07 같은 비교의 시각·텍스트 읽기

배경·문제: 변경별 검토의 본문은 원래 후보를 보여도 작업 옵션의 텍스트 읽기는 현재 projection을 사용한다. 목표는 같은 DiffViewer의 hunks·행 marker·기준 버전을 두 읽기 방식이 공유하는 것이다. 비목표는 비교·분해·결정·원래 후보 캐시·스크롤 정책 변경이다.

영향: `UnitReview → UnitReviewDiff → DiffViewer → TextDiff`와 CHANGES 작업 옵션의 중복 경로다. 현재의 `currentHeadId`, 원래/비활성의 `batch.baseVersionId`를 실제 버전 목록에서 조회하며 누락은 버전 미상·확인 필요로 표시한다. hunk의 여러 groupIds를 행 전체에 추정 적용하지 않고 시각 비교의 `kind:oldLine:newLine` marker를 그대로 사용한다.

| 대안 | 장점 | 단점·위험 | 결정 |
| --- | --- | --- | --- |
| 원래 후보 상태를 부모·작업 옵션으로 이동 | 기존 옵션 위치 유지 | 캐시·로딩 소유권 확대, 본문과 텍스트의 재불일치 가능 | 제외 |
| 같은 DiffViewer에서 텍스트 읽기 | 실제 표시 projection·marker 일치 | 직접 진입과 기준 설명 보강 필요 | 채택 |

가정: 원래 후보 성공 캐시와 최신 navigation의 결정 상태를 분리하고 두 viewer를 유지한다. 숨겨진 현재 비교를 원래 후보 로딩/실패의 대체로 노출하지 않는다. 원래 위치의 자동 복원은 focus=false로 하여 늦은 조회 응답이 코멘트 입력·숨은 본문으로 포커스를 이동하지 않으며 명시적인 위치 이동만 포커스를 옮긴다. 기존 PATCH/WHOLE의 텍스트 읽기·초기 접힘·50행 페이지는 유지한다.

2026-11-04 UX-07 구현: 같은 DiffViewer에서 실제 projection.hunks·시각 marker Map·비교 레이블을 TextDiff에 전달하고 CHANGES 작업 옵션의 중복만 제거했다. 버전 레이블은 두 시각 방식·텍스트 읽기에 같은 helper를 사용한다. 단위번호·선택은 행 key로 매핑하고 marker가 없으면 단위를 추정하지 않는다. 문자와 빈 행은 React 텍스트 노드로 렌더링한다. 페이지 clamp와 기본 접힘·50행·이력 레이블은 유지한다.

검증: 신규3파일10건을 포함해 관련9파일38건 통과, 전체 `npm run typecheck` 통과. 실제 DiffViewer SSR 경계에서 현재/원래 hunks 참조와 marker 전달을 검사했고 실제 TextDiffPages 렌더로 HTML 인코딩·빈 행·기준 설명을 확인했다. 이는 native의 토글·키보드·스크롤·실제 발화 검증을 대신하지 않는다. `useOriginalLocation` 자동 이동의 focus=false는 적용했으며 늦은 응답의 실제 포커스·로딩/실패/재시도는 후속 native 인수에서 확인한다. 빌드·E2E는 이 태스크에서 실행하지 않았다.

## 통합 검증의 경계와 보완

원래 비교 장애는 frozen Tauri invoke를 교체하지 않고, 해당 `original_rewrite` action·batch의 정확한 IPC fetch 요청만 가짜 응답으로 바꾼다. 다른 요청은 실제 fetch로 위임하고 pending 응답·descriptor는 finally에서 복원한다. 테스트 transport3건은 실제 frozen invoke·다른 요청 통과·cleanup을 검증한다. 본문·결정·등록 의견 불변식은 native에서도 확인한다.

화면9조합과 포커스·팝업·원래/현재 왕복의 여러 캡처를 수행하는 main 시나리오의 테스트 전체 제한은180초다. 개별 가시성·native 상태·두 프레임 대기는1초 제한을 유지한다. nativeVisible과 실제 WebView visible을 필수로 하고 nativeFocused는 측정에 기록한다. 실제 키 전달은 PID·경로·접근성·전면 상태를 별도로 엄격히 확인한다. 가려진 경우 측정 전에 한 번 실제 창을 show/raise하고 다시 visible을 확인한다. 비표시 측정을 성공으로 간주하지 않는다.

실제 keyboard 최초 실행은6/8 통과했다. Esc 복귀는 WebKit 포인터 클릭의 포커스 캡처 문제를 재현해 제품을 수정했다. repeat 단독 주입은 trusted keyup만 전달되어 검증 근거가 되지 못했다. 대안은 버튼에 freshdown을 함께 보내기(첫 입력으로 결정되어0건 검증에 부적합)와 비결정 제목에서 실제 hold 후 포커스 이동(대상 repeat만 검사 가능)이다. 후자를 선택하고 trusted freshdown→repeatdown→keyup·버튼 대상·finally 해제를 모두 검사한다. 실제 trace가 없으면 실패로 남긴다.

반복 주입의 PID 직접 경로는 선행 down·공유 세션 source·up 전 간격을 추가해도 repeatdown 전달 전제를 충족하지 못했다. [Apple의 로그인 세션 source 권장](https://developer.apple.com/documentation/coregraphics/cgeventsourcestateid)과 [WebKit의 NSEvent 반복 플래그 전달](https://github.com/WebKit/WebKit/blob/7ba63b1d24b41a6b2fbe9865c3d89df0e8bef431/Source/WebKit/Shared/mac/WebEventFactory.mm#L330)을 참고했으며 설치된 WebKit과 공개 main의 동일성은 가정하지 않는다. 대안은 PID 직접 경로의 전달 지점을 추가 관측(범위 좁음/추가 진단)과 로그인 세션 스트림으로 hold/반복만 전달(반복 보존 확인 가능/전면 앱 검증 필수)이다. 후자를 적용해 일반 키는 PID 직접 전송을 유지하고 hold/반복의 각 전송 직전에 검증한 테스트 앱의 전면 PID를 확인하며 finally에서 해제한다. 실제 trusted repeatdown과 대상이 확인된 최종 결과만 인정한다. 이는 OS 경로에 주입한 키이며 물리 키보드·실제 IME 검사가 아니다.
이 검사는 이벤트 queue와 실제 전달 사이 포커스 변경을 원자적으로 잠그지 않는다. 테스트 앱 전면 유지가 전제이며 검증 실패에는 전송·정리를 중단하고 무검증 전역 release로 넓히지 않는다. 현재 repeat 호출은 한 개씩이다. 허용 최대64개 repeat를 한 호출에 넣는 확장 사용은15초 caller timeout과 맞지 않으므로 이번 검증 범위에 포함하지 않는다.

긴 결합 변경은 정상 화면의 모든 관련 위치와800×600/200%를 별도 실제 생성 계획으로 검사한다. 처음에는 최소 폭·읽기 높이, 이후 범위 번호 가림이 실패했다. 최소 폭0의 줄바꿈과 제목 여백을 보완했으며 기존 높이80px·번호/본문 가시성·가로 넘침 검사 조건은 낮추지 않았다. 전체 통과 결과와 캡처 출처는 최종 실행으로 확정한다.

기존 `ux-local` 회귀도 이번 공유 경계의 검증에 포함했다. 이전 fixture는 실제 이동 여부 없이 scrollTop에24를 더한 뒤 즉시 닫힘을 판정하고, 물리 창 제약보다 큰1440×900 콘텐츠 영역을 요구했다(실제1440×859). 대안은 OS 크기 제약 우회(다른 fixture 영향·물리 제약)와 이번 창3×배율3 기준처럼 바깥 창 크기·실제 viewport를 함께 기록(작음·기준 명시 필요)이며 후자를 선택했다. 실제24px 이동·선택 확정·bounded2프레임·DOM 스크롤 뒤 기존 hit/글꼴/넘침/인용 높이 조건을 유지한다. UX-local에만 검증한 native 창 복원을 적용하고 다른 phase에 Swift 실행 의존을 추가하지 않았다. 첫 실패별 표시·포커스·선택 메타를 보존해 연쇄 실패와 구분한다. 이 보완에는 제품 변경이 없다.

### 보완 전 확정 결과

- `review-ux-e2e-main-heading.log`: main10건 + 별도 restart2건 통과. E2E build ID `12d185f3cb92d7ba-e2e`, source SHA-256 `12d185f3cb92d7ba508cc01ff3962af0294920504e4b1dbe7eb38a6f93cd8c92`.
- 새 초기1280×800/100%는 실제 viewport1280×768·DPR2·중앙폭724에서 도구121px(핵심78·진행42)·비교 레이블38px·diff317px다. 기준 diff228px 대비89px 증가했다. 스크롤 전 `initial-layout-1280-1.json/png`과 명시적 이동/스크롤 캡처를 구분했다.
- 창3×배율3의 검토·코멘트·오류·처리 기록, 팝업 경계/포커스·본문 내부 스크롤·왕복과 긴 결합 단위의 모든 관련 위치를 검사했다. 특히800×600/200%의 실제 CSS viewport400×284에서 줄바꿈된 본문·고정 번호·결정 접근과85px 읽기 영역을 확인했다. 대표1280/100은 선택 단위의 삭제/추가 전문과 결정이 함께 보인다.
- `review-ux-typecheck.log`, `review-ux-lint.log`, `review-ux-unit-final.log`: 타입·lint, Vitest65파일219건·Node9건 통과. 당시 제품 소스의 동작 변경을 반영한 결과다.
- 공유 회귀 `review`6건·`rewrite`7건·`recovery`2건·`history`4건·`selection-transitions`6건 통과. 각 로그는 `.artifacts/review-ux-regression-<phase>.log`다.
- `review-ux-e2e-keyboard-stream.log`:8건 통과. 실제 trusted freshdown→repeatdown→keyup과 승인 버튼 대상을 확인하고 반복 입력의 결정0건, fresh 입력1건, 이후 제목/완료의 추가 입력0건을 확인했다. 합성 composition Escape1건은 별도로 표시했다.
- Swift 입력 파서의 보수적 복잡도11을 발견해 일반 숫자 키 검증을 `parsePlainKey`로 분리했다. 대안은 허용키 switch 추가(중복·복잡도 증가)와 동일 guard 추출(작은 변경·검증 의미 유지)이며 후자를 택했다. 최종 `review-ux-e2e-keyboard-final-confirmed.log`에서8건을 다시 통과했다. 이 최종 실행도 stale-element2건은 자동 재조회 뒤 통과했으며 전달되지 않은 반복 입력을 통과로 처리한 사례는 없다.
- `review-ux-regression-ux-local-visible.log`:7건 통과. 긴 후보의 Shift+F10/실제 스크롤/Esc, 문단 선택과9개 화면 조합, 직접 수정·이전 후보·원문 범위·완료·첫 작업 확인을 검증했다. 따라서 중복 실행을 합산하지 않은 최종 native 범위는 main/restart12 + keyboard8 + 공유 회귀32 =52건이다.
- 최종 구조 점검: TS/JS/CSS77파일899함수, 최대 파일293 LOC·함수49 LOC·매개변수4·복잡도10이다. Swift153 LOC의 명명 함수 최대17 LOC·매개변수4·복잡도9이며 파서는 추출 뒤8/4다. 타입·전역 lint·공백 검사도 통과했다.
- main의 WebDriver stale-element 경고2건은 상태 전환 중 자동 재조회 뒤 해당 검사가 통과했다. 숨김·timeout·잘못된 테스트 전제의 앞선 실행과 최종 통과 결과를 합산하지 않는다.

실제 VoiceOver 발화와 한글 IME 조합·삭제는 미검증이다. OS 키 자동·합성 composition 가드·DOM 의미 검사로 이 수동 인수를 완료 처리하지 않는다. UX-09는 해당 확인을 남긴다.

### 보완 전 일반 앱 복원과 판정

모든 native 검사가 종료된 뒤 `npm run native:build`를 순차 실행했다. `review-ux-build-normal-final.log`의 타입·웹·Rust 일반 빌드가 성공했다. 웹 main은505.90kB(gzip149.08kB)로500kB 권고 경고가 있으며 이 UX 작업에서 임의 분할이나 경고 임계값 변경을 하지 않았다.

일반 build ID는 `12d185f3cb92d7ba-debug`, source SHA-256은 E2E와 같은 `12d185f3cb92d7ba508cc01ff3962af0294920504e4b1dbe7eb38a6f93cd8c92`다. `.artifacts/native-build.json`의 mode=normal, 실제 실행 파일 SHA-256=`133516bff07a041e7c10322421a26721e0590b4f6c41844e8d71241ce922e523`와 `.artifacts/build-debug.json`의 일치를 검증했다. 실제 바이너리에서 `e2e_process_id`, `e2e_generation_start`, `DOCREVIEW_E2E_DATA`, `tauri_plugin_wdio`가 모두 제외됐다. 요약 증명은 `.artifacts/review-ux-verification.json`에 있다.

SPEC·TODO·README·화면 계약·테스트 안내를 갱신했고 로컬 링크 누락0·공백 검사 통과다. 코드 구현·자동 검증은 완료했고 TODO9/10을 체크했다. UX-09의 실제 VoiceOver·IME를 미완료로 유지하며 다른 수동 인수나 설치 앱 업데이트를 수행한 것으로 표현하지 않는다.


## 목적 검토 후 보완 · FIX-01~04

Problem 1-Pager와 대안은 SPEC 8절·ADR-REVIEW-013~016을 따른다. 변경 경로는 `useUnitNavigation → UnitReviewDiff → DiffViewer/TextDiff`, `useReviewActions → UnitReviewTools`, `UnitReview → useUnitViewport`다. current/original의 표시 이동을 분리하고 중요 안내와 텍스트 페이지·행 연결만 보완했다. 분해·결정·DB/IPC·AI·원래 후보 본문·저장 경계는 변경하지 않았다.

- FIX-01: jump에 비교 scope를 명시하고 같은 활성 비교에만 전달한다. 원래 후보 자동 위치 이동은 focus=false를 유지하며 현재 비교의 좌표로 재생하지 않는다.
- FIX-02: 성공·진행과 오류·잠김·확인 취소를 생산 단계의 status/attention으로 구분한다. 중요 안내는 compact 진행 문구와 분리하여 role=alert로 표시한다. 작은 높이에서는 한 줄로 줄이되 DOM 전문·title·검토 도구 경로를 유지한다.
- FIX-03: 텍스트 선택 ID 변경·새 jump serial·명시 복귀만 해당 50행 페이지와 실제 row key로 연결한다. 수동 페이지 이탈은 유지하고 복귀 행동을 제공한다. 숨은/접힌 읽기는 표시 후 한 번만 이동하고 포커스를 변경하지 않는다. 일반 marker 갱신이나 비교 왕복은 수동 읽기 위치를 되돌리지 않는다.

추가 가정·영향: 중요 상태 진입의 한 번 정렬은 workspace.scrollTop만 바꾸며 표시 중인 작성 패널의 현재 포커스를 우선한다. 선택 단위·본문 내부 scroller·입력·문서 전체 스크롤·결정에는 영향을 주지 않는다. 극단적인 작은 오류 화면은 복구 이유 노출을 우선하고 정상 읽기 높이 인수와 구분해 실측값을 기록한다. 이미 중요 상태인 동안의 일반 렌더에는 정렬을 반복하지 않는다.

실패 재현과 검증 경계:

- 비교 scope 없이 활성 여부만 검사한 기존 전달에서2건 실패→수정 후 통과했고 실제 UnitReviewDiff 경계 회귀를 추가했다.
- 중요 피드백 SSR은 수정 전3건 실패·1건 통과였고 수정 후4건 통과했다. 로그는 `followup-feedback-before.log`, `followup-feedback-after.log`다.
- 텍스트의 뒤 페이지 선택·단위 행 부재2건과 실제 row key 전달 회귀를 실패→통과로 고정했다. mock geometry는 요청당 한 번 이동·숨김/비활성 보류·focus 불변을 검사하고 실제 행 가시성은 native에서 별도로 검사한다.
- `followup-e2e-1.log`는4건 중3건 통과, 외부 파일 변경의 중요 안내가 viewport 밖인1건 실패다. 상단 복구 안내가 추가되어도 외부 포커스 때문에 기존 정렬이 생략되는 제품 결함이었다. 측정 기준을 낮추지 않고 ADR-REVIEW-016의 중요 상태 진입 정렬을 적용했다.
- `followup-e2e-2.log`는 중요 안내 가시성 검사를 통과한 뒤 외부 충돌의 validity 불변 기대값에서 실패했다. 기존 `storage/queries.rs::set_status(CONFLICT)`는 미처리 제안을 STALE로 바꾸므로, 대안인 validity 검사 제외(간단/전이 누락) 대신 그 전이를 정확히 기대한다(기존 안전 계약 검증/명시 필요). 문서 head·내용 해시·결정·revision·회차·의견·생성 상태는 불변이며 외부 파일만 정확한 합성 값으로 바뀌어야 한다.
- `followup-e2e-final.log`의4건은 모두 통과했다. 실제 좌표 차이의 양방향 비교 scrollTop·첫 가시 행·포커스, 800×600/200%의 승인 실패·외부 잠김 안내 bounds/hit와 불변식, 60행 초과 실제 계획의 선택 행 bounds/hit·수동 이탈/복귀를 확인했다. 캡처·측정·빌드 출처는 `.artifacts/unit-review/after/followup-*.json/png`다.

기존4건의 일반 단위에는 여러 관련 위치가 없어 관련 위치 검사가 not-applicable이었다. 이를 완료 근거로 삼지 않고 별도 실제 결합 계획의5번째 사례를 추가했다. `followup-e2e-final-5.log`의5건이 모두 통과했고 관련 위치3곳을 각각 선택한 뒤 실제 이동 버튼을 눌러 해당 rowKey의 가시성·hit와 불변식을 확인했다. 위 보완 전52건과 중복 실행4건을 최신 통과 수에 합산하지 않는다. 실제 VoiceOver 발화·한글 IME 조합/삭제 인수는 계속 미확인이다.


### 보완 후 확정 결과와 일반 앱 복원

- `followup-typecheck-final.log`, `followup-lint-final.log`, `followup-unit-final.log`: 타입·전역 lint, Vitest69파일237건·Node9건 통과. 제품 소스는 이후 변경하지 않았다.
- `followup-regression-rewrite-review.log`: main10·별도 restart2건 통과. 창3×배율3·결합 단위·비교 로딩/실패/늦은 응답·코멘트 오류·재실행·재검토·일괄 무효화 경로를 다시 확인했다. 상태 전환의 stale-element 경고2건은 자동 재조회 뒤 통과했다.
- `followup-regression-keyboard.log`:8건 통과. 실제 OS trusted 반복키·탐색·입력/복귀·결정 수·제목/완료 포커스를 검사했다. 합성 composing Escape1건은 실제 IME 검증으로 간주하지 않는다.
- `followup-regression-<phase>.log`: `review`6·`rewrite`7·`history`4·`recovery`2·`selection-transitions`6건 통과. 이번 최신 소스의 native 합계는 보완5+main/restart12+keyboard8+공유25=50건이다. Rust/생성 계약은 이번 보완에서 변경하지 않았다.
- 실제 current/original scroller는1032/2016px와 서로 다른 첫 가시 행을 두 방향 왕복 후 그대로 보존했다. 텍스트는 실제87개 변경 행 중84번째 행의 단위를 선택해2페이지에서 드러냈고 수동 이탈·명시 복귀 뒤 같은 행을 확인했다. 별도 결합 계획은 관련 위치3곳의 실제 삭제/추가 행을 각각 확인했다.
- 800×600/200% 실제 CSS viewport400×284에서 중요 안내29px가 y128 부근에 표시되고 center hit·완전 가시성을 통과했다. 정상 읽기 높이 조건과 구분하여 오류 상태의 읽기 영역은 측정만 기록했다. 정상9조합 검사의 기존 높이·가림 조건은 변경하지 않았다.
- `.artifacts/unit-review/after/followup-structure.json`: 이번 보완의 제품·단위/native helper·실행기34파일353함수, 최대 파일291행·함수50행·매개변수4·복잡도10. 파싱 오류·제한 위반0건이며 파일 목록·SHA-256을 기록했다. 이는 작업 범위의 구조 검사다.

모든 E2E 종료 후 `npm run native:build`를 순차 실행해 일반 앱으로 복원했다. `followup-build-normal-final.log`의 타입·웹·Rust 빌드는 성공했다. 웹 main510.28kB(gzip150.45kB)의500kB 권고 경고를 남기고 임계값·분할 정책은 변경하지 않았다.

일반 build ID는 `620ea241394dd0a7-debug`, source SHA-256은 `620ea241394dd0a71e535b6b203b5e302aabbf1c10b31f735db17855b81c7a67`이며 E2E와 같다. `.artifacts/native-build.json` mode=normal, 현재 소스와 `.artifacts/build-debug.json`의 source hash, 실제 실행 파일 SHA-256=`8bb14e055475f3557f7e76dda81ec33d12f642b34bec5b18126fe6bded2be719`와 두 build 증명의 일치를 확인했다. 실제 바이너리에 `e2e_process_id`, `e2e_generation_start`, `DOCREVIEW_E2E_DATA`, `tauri_plugin_wdio`가 모두 없다. `.artifacts/followup-verification.json`에 최신 증명을 저장했다.

SPEC·TODO·README·화면 계약·테스트 안내를 동기화했다. 추가 FIX4/4 완료이며 원래 UX9/10과 실제 VoiceOver·IME 미완료는 유지한다. 설치 앱 교체나 수동 인수를 완료한 것으로 표현하지 않는다.
