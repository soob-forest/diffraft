# 요청 경계 보완 화면

소스 `8289d0ee20658e00…`의 합성 작업 공간에서 촬영한 실제 네이티브 화면이다. 이미지 해시·픽셀 크기·촬영 파일 시각·빌드 출처는 [manifest](manifest.json)에 있다. 세 장에는 viewport/배율을 별도 기록하지 않았으므로 9개 크기·배율 인수로 집계하지 않는다. 동작의 단정은 화면만이 아니라 [수정 기록](../../development/request-workflow-critical-fixes.md)의 테스트 assertion과 함께 읽는다.

- [최초 선택 취소 후 이어쓰기](first-click-dismiss-resumed.png): 작업 생성 전 다른 본문 클릭으로 닫은 뒤 같은 첫 지시를 복원했다.
- [일반 요청 재확인](general-preparation-renewed.png): 준비 중 모델 변경으로 이전 결과를 폐기한 뒤 새 Opus 확인을 열었다.
- [선택 요청 재확인](selected-preparation-renewed.png): 같은 인용·지시를 유지하고 새 Opus 확인을 열었다.

이전 소스의 전체 화면 격자는 [기존 캡처](../request-workflow/README.md)에 이력으로 보존한다. 이번 수정에는 레이아웃·CSS 변경이 없다.
