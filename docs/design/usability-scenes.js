/* Static, synthetic design content. No product commands, storage, or network access. */
(() => {
  const control = (text, variant = "") => `<span class="control ${variant}">${text}</span>`;
  function app(content, options = {}) {
    const narrow = options.narrow ? "narrow" : "";
    return `<div class="mock ${narrow} ${options.className || ""}" aria-label="정적 디자인 제안" inert>
      <div class="app-top"><span class="brand">D</span><strong>DocReview</strong><span class="subtle">내 작업 공간</span></div>
      <div class="app-body">${content}</div>
      <div class="app-foot">로컬 작업 공간 · 승인한 변경만 확정본에 반영됩니다.</div></div>`;
  }
  function sidebar(title = "document") {
    return `<aside class="sidebar"><p class="subtle">문서</p>${control("문서 열기")}${control("새 문서")}${control("AI 연결 설정")}<hr class="section-divider">${control(title, "selected")}</aside>`;
  }
  function head(review = false, narrow = false, version = "") {
    return `<div class="doc-head"><div class="row spread"><div class="row"><h2>${review ? "review" : "document"}</h2><span class="version">${version || (review ? "v12" : "v2")}</span><span class="saved">원문 저장됨</span></div>
      <div class="row">${narrow ? control("문서 목록") : control("파일 비교·복구")}${control("확정본 내보내기")}</div></div>
      <div class="tabs">${control("원문", review ? "" : "selected")}${control("변경 검토", review ? "selected" : "")}${control("미리보기")}</div></div>`;
  }
  function source(travel = false) {
    const lines = travel ? ["# 여행 준비 가이드", "", "## 1. 출발 준비", "준비를 마치면 동행인에게 알립니다.", "출발 시간과 이동 경로를 함께 기록합니다.", "", "## 2. 확인 시간", "출발 전 10분 동안 준비물을 확인합니다."] : ["# 저장한 문서", "", "한글 😀 저장 확인", ""];
    return `<div class="editor">${lines.map((line, index) => `<div class="source-line"><span class="number">${index + 1}</span><span>${line || "&nbsp;"}</span></div>`).join("")}</div>`;
  }
  function requestPanel(narrow = false) {
    if (narrow) return `<aside class="task"><h3>AI 요청</h3><div class="conditions"><strong>목표·조건</strong><p>수치 유지 · 한국어로 간결하게 · 조건 편집</p></div>
      <div class="row">${control("수정 제안", "selected")}${control("설명만")}</div><div class="scope"><div class="row spread"><strong>요청 범위</strong>${control("변경")}</div><span class="subtle">전체 문서 · v2</span></div>
      <span class="label">이번 요청</span><div class="field request-field">수치는 유지하고 표현을 간결하게 해 주세요.</div><div class="draft-note">요청 초안 · 이 세션에서 보존</div>${control("전달 내용 확인", "primary wide")}</aside>`;
    return `<aside class="task"><h3>현재 작업</h3><div class="field">사실과 수치 유지</div>
      <div class="conditions"><strong>작업 목표·조건</strong><p>수치 유지 · 한국어로 간결하게</p><span class="subtle">조건 편집</span></div>
      <h3>AI 요청</h3><div class="row">${control("수정 제안", "selected")}${control("설명만")}</div>
      <div class="scope"><div class="row spread"><strong>요청 범위</strong>${control("변경")}</div><span class="subtle">전체 문서 · v2</span></div>
      <span class="label">이번 요청</span><div class="field request-field">수치는 유지하고 표현을 간결하게 해 주세요.</div>
      <div class="draft-note">미전송 초안 · 앱을 닫으면 사라집니다.</div>${control("요청 내용 확인", "primary wide")}
      ${narrow ? "" : `<p class="subtle" style="margin-top:12px">확인 후 요청합니다. 승인 전에는 원문을 바꾸지 않습니다.</p><hr class="section-divider"><span class="subtle">전체 재작성 요청</span><hr class="section-divider"><h4>작업 대화</h4><p class="subtle">이 작업의 요청과 응답을 이어서 확인합니다.</p>`}</aside>`;
  }
  function workspace() {
    return app(`${sidebar()}<section class="document">${head()}${source()}<div class="history">버전 기록 · 2개</div></section>${requestPanel()}`);
  }
  function diff() {
    return `<div class="diff"><div class="diff-heading">1. 출발 준비</div>
      <div class="diff-line minus"><span class="number">4</span><span>−</span><span>준비를 <mark>마치면</mark> 동행인에게 알립니다.</span></div>
      <div class="diff-line plus"><span class="number">4</span><span>+</span><span>준비 <mark>확인이 끝나면</mark> 동행인에게 <mark>바로</mark> 알립니다.</span></div>
      <div class="diff-line"><span class="number">5</span><span>출발 시간과 이동 경로를 함께 기록합니다.</span></div>
      <div class="diff-heading">2. 확인 시간</div><div class="diff-line minus"><span class="number">8</span><span>−</span><span>출발 전 <mark>10분</mark> 동안 준비물을 확인합니다.</span></div>
      <div class="diff-line plus"><span class="number">8</span><span>+</span><span>출발 전 <mark>5분</mark> 동안 준비물을 확인합니다.</span></div>
      <div class="diff-line"><span class="number">9</span><span>준비가 늦어지면 진행 상황을 공유합니다.</span></div>
      <div class="diff-heading">3. 여행 기록</div><div class="diff-line minus"><span class="number">12</span><span>−</span><span>필요하면 다음 준비 사항을 정리합니다.</span></div>
      <div class="diff-line plus"><span class="number">12</span><span>+</span><span>다음 준비 사항이 있으면 정리합니다.</span></div></div>`;
  }
  function review() {
    return app(`${sidebar("review")}<section class="document">${head(true)}
      <div class="change-actions"><div class="row spread"><strong>변경 검토 · 남은 3개</strong>${control("남은 3개 승인")}</div>
      <div class="row spread"><span>1 / 3 · 출발 준비</span><div class="row">${control("이전")}${control("다음")}${control("선택 변경 거절")}${control("선택 변경 승인", "primary")}</div></div></div>
      <div class="notice"><div class="row">${control("인라인", "selected")}${control("나란히")}<span>전체 문맥 · 공백 표시 · − 삭제 / + 추가</span></div></div>
      ${diff()}<div class="history">버전 기록 · 12개</div></section><aside class="task"><div class="row" style="margin-bottom:24px">${control("변경 상세", "selected")}${control("작업·대화")}</div><h3>선택한 변경</h3><strong>출발 준비</strong><p class="subtle">독립 승인 그룹 1개 · 문장 표현 개선</p>
      <div class="conditions"><strong>유지할 조건</strong><p>수치 유지</p></div><div class="quote">준비 확인이 끝나면 동행인에게 바로 알립니다.</div>
      ${control("코멘트 작성", "wide")}<p class="subtle" style="margin-top:16px">직접 후보 수정 · 이 변경 다시 제안</p><hr class="section-divider"><strong>현재 작업 이어가기</strong><p class="subtle">위의 ‘작업·대화’에서 조건과 AI 요청을 열 수 있습니다.</p></aside>`);
  }
  function comment(before = false) {
    if (before) return app(`${sidebar("review")}<section class="document">${head(true)}<div class="old-comment"><h3>코멘트 남기기</h3><span class="label">대상 쪽</span><div class="field">변경 후</div><div class="quote">출발 전 5분 동안 준비물을 확인합니다.</div><span class="label">코멘트</span><div class="field">확인 시간은 10분으로 유지해 주세요.</div>${control("코멘트 저장")}<div class="next"><h3>코멘트 반영·다시 제안</h3><span class="label">재제안 지시</span><div class="field"></div>${control("재제안 요청")}</div></div></section>`);
    return app(`${sidebar("review")}<section class="document">${head(true)}<div class="notice">선택한 변경 · 2 / 3 · 확인 시간</div>${diff()}<div class="history">원문으로 이동해도 미저장 코멘트 초안을 유지합니다.</div></section>
      <aside class="task"><h3>선택한 변경에 코멘트</h3><div class="row">${control("변경 전")}${control("제안 내용", "selected")}</div><div class="quote">출발 전 5분 동안 준비물을 확인합니다.</div>
      <span class="label">코멘트</span><div class="field request-field">확인 시간은 10분으로 유지해 주세요.</div><p class="draft-note">미저장 초안 · 이 세션에서 보존</p>${control("코멘트 저장", "primary wide")}
      <p class="subtle" style="margin-top:16px">저장만으로 AI 요청이 시작되지 않습니다.</p><hr class="section-divider"><h4>저장 후 다음 행동</h4><p class="subtle">이 변경의 코멘트를 반영해 다시 제안받을 수 있습니다. 새 후보도 승인 전에는 원문을 바꾸지 않습니다.</p>${control("코멘트 반영·다시 제안", "wide")}</aside>`);
  }
  function resume() {
    return app(`${sidebar()}<section class="document">${head(false, false, "v3")}<div class="resume"><div><strong>이 작업의 남은 변경 3개</strong><p class="subtle">사실과 수치 유지 · 아직 원문에 반영하지 않았습니다.</p></div>${control("검토 이어가기", "primary")}</div>
      ${source()}<div class="notice"><div class="row spread"><span>제안 승인 완료 · 적용 전 v2와 비교할 수 있습니다.</span>${control("적용 전 내용 비교")}</div><span class="subtle">추가 편집이 있다면 복원 영향도 함께 확인합니다.</span></div><div class="history">버전 기록</div></section>
      <aside class="task"><h3>현재 작업</h3><div class="field">사실과 수치 유지</div><div class="notice warn"><strong>마지막 요청 실패</strong><p>원문과 이전 제안은 유지했습니다.</p></div><span class="label">지난 요청</span><div class="quote">수치는 유지하고 표현을 간결하게 해 주세요.</div>${control("같은 요청 다시 실행", "wide")}<div style="height:12px"></div>${control("내용을 수정해 새 요청", "primary wide")}<p class="subtle" style="margin-top:16px">새 요청은 최신 원문과 범위를 다시 확인합니다. 기존 초안이 있으면 덮어쓰기 전에 선택합니다.</p></aside>`);
  }
  function narrow(before = false) {
    if (before) return app(`${sidebar()}<div class="old-stack"><section class="document">${head(false, true)}${source()}<div class="history">범위 · 전체 문서 · 범위 확인</div><div class="history">버전 기록</div></section><aside class="task"><h3>문서 작업</h3><p>현재 작업 · 사실과 수치 유지</p><div class="field">작업 목표</div><div class="field">고정 조건</div><h3>AI 요청</h3></aside></div>`, { narrow: true, className: "old-narrow" });
    return app(`<section class="document">${head(false, true)}<div class="notice"><div class="row spread"><span>작업 · 사실과 수치 유지</span>${control("작업 패널 닫기")}</div></div>${source()}<div class="history">버전 기록 · 문서 목록과 목차는 필요할 때 열기</div></section>${requestPanel(true)}`, { narrow: true });
  }
  function connection() {
    return app(`${sidebar()}<section class="document">${head()}${source()}</section>${requestPanel()}<div class="dialog-back"><section class="settings"><h2>공식 Claude Code 연결</h2><p class="subtle">macOS native CLI · 공식 구독 계정</p>
      <div class="notice success"><strong>연결 테스트를 완료했습니다.</strong><p style="margin:8px 0 0">이제 문서에서 AI 수정을 요청할 수 있습니다.</p></div><div class="row">${control("설정 닫기", "primary")}${control("상태 다시 확인")}</div>
      <hr class="section-divider"><details><summary>진단 정보·설치 설정</summary><p class="subtle">실행 파일 · /synthetic/claude<br>버전 · 2.1.312<br>최소 지원 버전 · 2.1.295 이상 정식 버전</p><div class="row">${control("설치 경로 변경")}${control("공식 로그인 열기")}${control("연결 테스트")}</div></details>
      <hr class="section-divider"><p class="subtle">로그인과 인증 정보는 공식 CLI가 관리합니다. 로컬 편집·저장에는 로그인이 필요하지 않습니다.</p><p class="subtle">연결 테스트·AI 요청은 사용 한도를 소비할 수 있으며, 중단해도 이미 처리된 사용량은 취소되지 않습니다.</p></section></div>`);
  }
  const scenes = [
    { id: "request", label: "요청·범위", title: "요청을 먼저 쓰고, 바로 옆에서 범위를 확인", description: "자주 바꾸지 않는 조건은 요약하고, 이번 요청과 실행 대상을 한곳에 모읍니다.", image: "../usage/images/workspace.png", after: workspace, beforeNote: "현재 편집 캡처. 조건 폼이 요청보다 위에 있고 범위는 중앙 하단에 있습니다.", afterNote: "현재 앱 캡처와 같은 문서·버전의 배치 제안. 요청 내용은 합성 예시이며 조건 편집·전체 재작성 진입을 유지합니다.", changes: [["목표·고정 조건이 요청 입력을 아래로 밀어냄", "조건은 요약하고 요청 입력·실행 공간을 확보", "T2-02, T2-03"], ["범위와 실행 위치가 떨어짐", "요청 바로 위에 전체 문서·v2·변경 진입점 표시", "T3-01~03"], ["상단 ‘저장됨’의 적용 범위가 모호함", "원문 저장과 미전송 요청 초안을 별도로 표시", "T1-06"]] },
    { id: "review", label: "비교·승인", title: "읽는 변경과 결정 행동을 함께 유지", description: "전체 승인과 선택 승인을 구분하고, 긴 문서를 읽을 공간을 확보합니다.", image: "../usage/images/change-review.png", after: review, beforeNote: "현재 검토 캡처. 선택 승인·거절은 diff 아래에 있고 전체 승인은 위에 있습니다.", afterNote: "현재 앱 캡처와 같은 여행 준비 예시·v12·첫 변경 선택 상태. 상단 도구 영역은 고정하고 비교 본문을 넓히는 제안입니다.", changes: [["결정하려면 diff 아래로 이동", "선택 그룹과 승인·거절을 비교 상단에 함께 배치", "T4-01, T4-02"], ["그룹별 버튼이 늘고 전체 승인 대상 수가 멀리 있음", "현재 위치·이전·다음과 남은 승인 그룹 수를 명시", "T4-03, T4-04"], ["코멘트가 비교 아래로 이어짐", "선택한 변경의 보조 패널에서 코멘트 진입", "T4-05"]] },
    { id: "comment", label: "코멘트·초안", title: "원문을 확인하러 가도 작성하던 의견은 유지", description: "코멘트의 대상·초안 상태·저장 후 다음 행동을 한 흐름으로 연결합니다.", before: () => comment(true), after: () => comment(), beforeNote: "실제 캡처가 없는 펼친 상태를 CommentForm·RegenerateForm 코드로 재구성했습니다. 픽셀 일치 화면은 아닙니다.", afterNote: "코멘트와 비교 내용을 함께 보는 제안. ‘저장 후 다음 행동’은 흐름 설명이며 실제 재제안은 명시적으로 실행합니다.", changes: [["저장 전 입력과 대상이 화면 컴포넌트에 묶임", "미저장 초안의 세션 내 보존 범위를 표시", "T1-04~06"], ["대상 쪽과 인용을 다시 확인해야 함", "선택 변경과 인용을 코멘트 바로 위에 유지", "T4-01, T4-05"], ["코멘트 저장과 재제안의 관계를 알아야 함", "저장만으로 요청되지 않음을 설명하고 다음 행동 연결", "T7-03"]] },
    { id: "resume", label: "재개·회복", title: "하던 검토를 찾고, 실패한 요청을 고쳐서 다시 시작", description: "저장된 데이터의 복원과 사용자가 작업을 이어가는 동선을 연결합니다.", image: "../usage/images/workspace.png", after: resume, beforeNote: "현재 원문 화면의 실제 캡처를 참고로 사용했습니다. 재시작 직후·실패 상태를 촬영한 화면은 아닙니다.", afterNote: "남은 변경·요청 실패·승인 완료 안내의 위치를 함께 보여주는 합성 상태 예시입니다. 현재 캡처와 동일한 작업 이력은 아닙니다.", changes: [["원문으로 시작하면 남은 검토를 다시 찾아야 함", "현재 작업의 남은 변경과 검토 이어가기 제공", "T5-01, T5-02"], ["문서가 바뀐 실패 요청은 처음부터 작성해야 함", "지시만 가져와 최신 기준으로 새 요청 작성", "T5-03, T5-04"], ["승인 전 상태를 버전 번호로 찾아야 함", "적용 전 비교로 연결하고 추가 편집 영향 확인", "T5-05, T5-06"]] },
    { id: "narrow", label: "좁은 창", title: "작은 창에서는 보조 패널을 필요할 때 열기", description: "800×600 제안 배치입니다. 문서 폭과 요청 접근성을 함께 확보합니다.", before: () => narrow(true), after: () => narrow(), width: 800, height: 600, beforeNote: "950px 이하에서 작업 패널이 본문 아래로 가는 현재 CSS를 단순 재구성했습니다. 800×600 실제 캡처·실측 결과는 아닙니다.", afterNote: "문서 목록은 접고 요청 패널을 연 상태의 제안. 요청 후 패널을 접어 비교 공간을 확장하는 방향입니다.", changes: [["문서·조건·요청이 세로로 길게 이어짐", "문서 목록은 접고 작업 패널을 선택적으로 열기", "T6-01, T6-02"], ["작은 창에서 현재 작업과 요청을 찾기 어려울 수 있음", "접힌 목록 진입과 현재 작업을 상단에 표시", "T6-01, T6-04"], ["나란히 보기의 실제 가독성은 미검증", "실측 폭이 부족하면 인라인 전환 안내 제공", "T6-03, T6-05"]] },
    { id: "connection", label: "연결 설정", title: "성공하면 설정을 끝내고, 필요한 진단만 펼쳐 보기", description: "이미 연결된 사용자가 다음 행동을 버튼 목록에서 추론하지 않게 합니다.", image: "../usage/images/ai-connection.png", after: connection, beforeNote: "연결 테스트 성공 상태의 실제 캡처. 경로·로그인·테스트·닫기가 같은 무게로 나열됩니다.", afterNote: "현재 앱 캡처와 같은 성공 상태·합성 CLI 경로·버전 예시. 기본 행동은 설정 닫기, 나머지는 진단 영역에 모으는 제안입니다.", changes: [["성공해도 가능한 행동이 모두 같은 비중", "성공 상태와 설정 닫기를 먼저 강조", "T7-01"], ["실행 파일·버전이 다음 행동보다 먼저 보임", "기술 정보는 진단 영역으로 낮춰 배치", "T7-01, T7-04"], ["로컬 편집과 AI 연결의 조건이 혼동될 수 있음", "로컬 편집은 로그인 없이 가능하다는 안내 유지", "T7-05"]] }
  ];
  const designReferences = [
    ["S01_editor", "S01 기존 편집 시안. 문서·선택 범위가 새 목업과 달라 배치·미감 참고용입니다.", "요청 입력의 읽기 크기를 키우고 조건의 반복 경계선을 줄였습니다. 범위와 버전은 중립색, 요청 확인만 청색 채움으로 구분합니다."],
    ["S02_inline_diff", "S02 기존 인라인 시안. v12의 세 변경을 보여주지만 새 목업과 일부 제안 문구·표현 방식이 다릅니다.", "여러 승인 버튼의 청색 경쟁을 줄이고 선택 승인에 집중합니다. 본문은 16px, 모드 탭은 밑줄, 도구 배경은 중립색으로 정돈합니다."],
    ["S04_comment_revision", "S04는 v13·D03 재제안 완료, 새 목업은 v12·D02 코멘트 작성 상태입니다. 같은 상태의 전후 캡처가 아닙니다.", "비교 본문과 인용을 먼저 읽게 하고 초안은 성공 녹색 대신 중립색으로 표시합니다. 입력·인용의 경계는 남기고 안내의 반복 선을 줄입니다."],
    ["S08_resume", "S08은 v13·D03 r2 검토 대기, 새 목업은 별도의 합성 작업 이력입니다. 상태가 달라 배치·미감 참고용입니다.", "재개 안내를 중립면으로 낮추고 행동을 강조합니다. 실패 상태의 황색은 유지하며 보조 설명·현재 작업의 글자 위계를 통일합니다."],
    ["S01_editor", "기존 S01은 1600×1000 설계이며 작은 창 시안이 아닙니다. 새 목업은 800×600 배치 제안으로 실제 앱 검증 전입니다.", "좁은 창에서도 원문은 16px을 유지합니다. 조건·범위의 여백을 줄이고 주요 버튼은 폭 안에서 줄바꿈하여 읽기 크기로 공간 문제를 숨기지 않습니다."],
    ["S00_connection", "S00은 설치·로그인 확인 후 테스트 전, 새 목업은 테스트 성공 상태입니다. 상태가 다른 디자인 참고 비교입니다.", "성공 상태와 설정 닫기에 시선을 모으고 진단은 보조 위계로 둡니다. 제목22·본문16·보조13의 크기와 영역별 여백을 맞춥니다."]
  ];
  scenes.forEach((scene, index) => {
    const [screen, note, visualNote] = designReferences[index];
    Object.assign(scene, { designImage: `assets/screens/${screen}.png`, designNote: note, visualNote });
  });
  function getBaseline(scene, kind) {
    if (kind === "design") return { image: scene.designImage, note: scene.designNote, title: "기존 디자인", provenance: "기존 디자인 0.2 · 2026-10-26 · 정적 시안" };
    return { image: scene.image, note: scene.beforeNote, title: "현재 앱", provenance: scene.image ? "실제 앱 캡처 · 2026-10-28" : "코드 기반 재구성 · 실제 캡처 아님" };
  }
  globalThis.docReviewComparison = { scenes, getBaseline };
})();
