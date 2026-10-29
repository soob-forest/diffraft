(() => {
  const states = [
  [
    "S01 조건 접힘",
    "request",
    "task",
    "목표·조건 요약",
    "수치 유지 · 한국어로 간결하게. 요청 입력 위에서 확인합니다.",
    "조건 편집",
    "neutral"
  ],
  [
    "S01 조건 편집",
    "request",
    "task",
    "조건 편집 중",
    "목표와 고정 조건을 수정합니다. 접거나 요청하면 먼저 저장합니다.",
    "조건 저장",
    "neutral"
  ],
  [
    "S01 조건 저장 실패",
    "request",
    "task",
    "조건을 저장하지 못했습니다",
    "입력은 유지됩니다. 다시 저장하기 전에는 요청·작업 이동을 하지 않습니다.",
    "다시 저장",
    "error"
  ],
  [
    "S01 범위 무효",
    "request",
    "task",
    "선택한 범위를 다시 지정하세요",
    "요청 내용은 유지됩니다. 전체 문서로 자동 확대하지 않습니다.",
    "원문에서 선택",
    "error"
  ],
  [
    "S02 긴 변경",
    "review",
    "document",
    "선택 1 / 3 · 출발 준비",
    "긴 본문만 스크롤합니다. 선택 대상과 승인 도구는 남깁니다.",
    "선택한 변경 승인",
    "neutral"
  ],
  [
    "S02 선택 위치 이탈",
    "review",
    "document",
    "선택 1 / 3 · 출발 준비",
    "스크롤 위치가 달라져도 승인 대상은 바뀌지 않습니다.",
    "선택 위치로 이동",
    "neutral"
  ],
  [
    "S02 승인 중",
    "review",
    "document",
    "선택한 변경을 반영하는 중",
    "대상과 승인·거절을 잠급니다. 다음 변경을 자동 승인하지 않습니다.",
    "처리 중",
    "neutral"
  ],
  [
    "S02 승인 실패",
    "review",
    "document",
    "변경을 반영하지 못했습니다",
    "확정본과 제안은 유지됩니다. 오류를 확인한 뒤 다시 시도하세요.",
    "다시 확인",
    "error"
  ],
  [
    "S04 미저장 초안",
    "comment",
    "task",
    "미저장 코멘트",
    "대상 쪽과 인용을 함께 보존합니다. 앱을 닫으면 초안은 사라집니다.",
    "코멘트 저장",
    "neutral"
  ],
  [
    "S04 저장 완료",
    "comment",
    "task",
    "코멘트를 저장했습니다",
    "AI에는 아직 다시 요청하지 않았습니다.",
    "재제안 지시 작성",
    "success"
  ],
  [
    "S04 대상 재확인",
    "comment",
    "task",
    "제안이 바뀌었습니다",
    "기존 인용과 입력을 남깁니다. 연결할 위치를 확인해야 저장할 수 있습니다.",
    "현재 선택으로 대상 재확인",
    "error"
  ],
  [
    "S04 재제안 실패",
    "comment",
    "task",
    "다시 제안받지 못했습니다",
    "이전 제안과 작성한 지시는 유지됩니다.",
    "지시 확인 후 재시도",
    "error"
  ],
  [
    "S00 미설치",
    "connection",
    "settings",
    "Claude Code를 찾지 못했습니다",
    "로컬 편집·저장은 계속 사용할 수 있습니다.",
    "공식 설치 안내 열기",
    "error"
  ],
  [
    "S00 로그인",
    "connection",
    "settings",
    "공식 로그인이 필요합니다",
    "인증 정보는 공식 CLI가 관리합니다.",
    "공식 로그인 열기",
    "neutral"
  ],
  [
    "S00 준비",
    "connection",
    "settings",
    "AI 요청을 시작할 수 있습니다",
    "연결 테스트는 아직 실행하지 않았습니다.",
    "설정 닫기",
    "neutral"
  ],
  [
    "S00 성공",
    "connection",
    "settings",
    "연결 테스트를 완료했습니다",
    "문서로 돌아가 AI 요청을 작성하세요.",
    "설정 닫기",
    "success"
  ],
  [
    "S00 실패",
    "connection",
    "settings",
    "연결 요청을 완료하지 못했습니다",
    "확인된 오류를 읽고 상태를 다시 확인하세요. 로컬 편집은 가능합니다.",
    "상태 다시 확인",
    "error"
  ],
  [
    "S00 중단",
    "connection",
    "settings",
    "CLI 종료를 확인하는 중",
    "이미 처리된 사용량은 취소되지 않습니다. 종료 확인 전 중복 요청을 막습니다.",
    "중단 중",
    "neutral"
  ],
  [
    "800×600 요청 패널",
    "narrow",
    "task",
    "작업 패널",
    "본문과 요청을 왕복합니다. 조건·선택·초안은 유지합니다.",
    "본문으로",
    "neutral"
  ]
];
  const picker = document.getElementById("state");
  const stage = document.getElementById("target");
  states.forEach((state,index) => { const option = document.createElement("option"); option.value = index; option.textContent = state[0]; picker.append(option); });
  function fit() { const mock = stage.firstElementChild; if (!mock) return; const width = Number(mock.dataset.width); mock.style.transform = `scale(${stage.clientWidth / width})`; stage.style.height = `${stage.clientWidth * Number(mock.dataset.height) / width}px`; }
  function render() {
    const state = states[Number(picker.value)] || states[0];
    const scene = globalThis.docReviewComparison.scenes.find(scene => scene.id === state[1]);
    stage.innerHTML = scene.after();
    const mock = stage.firstElementChild; mock.classList.add("refined"); mock.dataset.width = scene.width || 1440; mock.dataset.height = scene.height || 900;
    const notice = document.createElement("section"); notice.className = `state-contract ${state[6]}`;
    const title = document.createElement("strong"); title.textContent = state[3];
    const description = document.createElement("p"); description.textContent = state[4];
    const action = document.createElement("span"); action.className = "control primary"; action.textContent = state[5];
    notice.append(title,description,action); mock.querySelector(`.${state[2]}`).prepend(notice);
    document.getElementById("description").textContent = `${state[0]} · 안내는 ${state[2] === "task" ? "오른쪽 패널" : state[2] === "settings" ? "연결 확인창" : "본문 도구 영역"}에 둡니다.`;
    fit();
  }
  picker.onchange = render; new ResizeObserver(fit).observe(stage); render();
})();
