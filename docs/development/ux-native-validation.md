# 실제 입력기·VoiceOver 인수 절차

2026-11-01 · SPEC T16의 남은 수동 검사다. 자동 검사나 문자 삽입을 실제 입력기·스크린리더 통과로 집계하지 않는다.

## 이번 시도의 결과

화면 잠금은 해제됐고 native E2E와 접근성 트리 조회는 가능했다. 설치된 앱과 구별되는 `DocReview UX.app`을 테스트 산출물 폴더에 만들고, 임시 문서·DB만 열었다.

네이티브 제어의 `gks` 입력으로 `한`, Backspace로 `하`, 이어 쓰기로 `하 한글`을 관찰했다. 그러나 원문에서 관측한 `compositionstart/end`는 모두 0이었다. 선택 지시에서도 Esc가 조합 취소 대신 작성 화면을 닫았다. 따라서 실제 조합 중 삭제·저장·Esc 검증으로 인정하지 않는다. Cmd+F5 및 VoiceOver 앱 진입을 시도한 뒤에도 VoiceOver 프로세스가 실행되지 않아 읽기·이동을 검증하지 못했다. 시작·종료 시 VoiceOver는 모두 꺼진 상태였다.

결과는 `.artifacts/ux/native-verification.json`과 실패 종료한 수동 검사 로그에 남겼다. 제품의 IME 결함이나 VoiceOver 접근성 통과로 해석하지 않는다. 권한을 새로 부여하거나 입력·보안 설정을 변경하지 않았다.

## 격리된 수동 검사 시작

`apps/desktop`에서 빌드가 끝난 뒤 실행한다. 다른 E2E나 Cargo 빌드와 동시에 실행하지 않는다.

```sh
npm run native:build:e2e
npm run test:e2e -- ux-native
```

이 선택 실행만 실제 키보드 확인을 기다린다. 기본 전체 E2E에는 포함하지 않는다. 각 단계는 최대 10분을 기다리며, `.artifacts/ux/native-session.json`의 `stage`, `pid`, `root`로 현재 테스트 프로세스와 임시 경로를 확인한다. `/Applications/DocReview.app`의 사용자 문서를 사용하지 않는다.

## 1. 원문 두벌식 입력

`stage=source-ime`이면 테스트 창의 원문 끝에서 실제 두벌식 키보드로 다음을 확인한다.

1. `한`을 입력하고, 아직 조합 중일 때 Backspace로 `하`가 남는지 확인한다.
2. 잠시 기다려도 조합 중간 값을 확정 저장하지 않는지 확인한다.
3. 공백 후 `한글`을 이어 써 `하 한글`을 완성하고 조합을 끝낸다. 원문 저장 완료를 확인한다.

확인 후 별도 터미널에서 아래 신호를 보낸다. 테스트는 실제 composition 이벤트와 임시 파일의 저장 문자열을 추가 검사한다.

```sh
python3 - <<'PY'
import json, pathlib
state = json.loads(pathlib.Path('.artifacts/ux/native-session.json').read_text())
assert state['stage'] == 'source-ime'
pathlib.Path(state['root'], 'source-ime-done').write_text(json.dumps({'physicalKeyboard': True}))
PY
```

## 2. 선택 지시·VoiceOver

`stage=selected-ime-voiceover`에서 선택 수정 패널을 사용한다.

1. 실제 두벌식 조합·자모 삭제를 확인한다. 조합 중 Esc가 작성 패널을 닫지 않는지 확인한다.
2. 조합을 끝낸 뒤 Enter가 지시에 줄바꿈을 넣고 AI를 실행하지 않는지 확인한다.
3. 실제 VoiceOver를 켠다. 수정 대상·인용·지시의 레이블과 확인 버튼을 읽고 이동할 수 있는지 확인한다. 변경 상세/작업·대화 탭의 이름·선택 상태도 확인한다.
4. 일반 Esc/복귀 뒤 diff의 선택과 포커스를 확인한다. 확인 단계에서 취소해도 지시가 보존되는지 확인한다. 최종 AI 실행 버튼은 누르지 않는다.
5. 시작 때의 VoiceOver·입력기 상태로 복원한다.

모두 직접 확인한 경우에만 다음 신호를 보낸다. 검사하지 못한 항목이 있으면 `voiceOverVerified`를 참으로 기록하지 않는다.

```sh
python3 - <<'PY'
import json, pathlib
state = json.loads(pathlib.Path('.artifacts/ux/native-session.json').read_text())
assert state['stage'] == 'selected-ime-voiceover'
pathlib.Path(state['root'], 'selected-ime-voiceover-done').write_text(json.dumps({'voiceOverVerified': True, 'physicalKeyboard': True}))
PY
```

자동 검사는 조합 이벤트와 AI 요청 미실행도 확인한다. 읽기 품질·포커스 관찰은 수동 기록이며, 일반 E2E의 DOM 검사와 구분한다. 종료 후 `npm run native:build`로 일반 빌드를 복원한다. 실제 작성자의 준비 시간·전환·재입력·범위 이해 평가는 별도 사용자 평가로 남는다.
