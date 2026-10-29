(() => {
  const { scenes, getBaseline } = globalThis.docReviewComparison;
  const byId = (id) => document.getElementById(id);
  const dialog = byId("enlarged");
  let selected = scenes[0];
  let baseline = "design";
  let returnFocus = null;

  function fitStage(stage) {
    const mock = stage.querySelector(".mock");
    if (!mock || !stage.clientWidth) return;
    const width = Number(mock.dataset.width);
    const height = Number(mock.dataset.height);
    mock.style.transform = `scale(${stage.clientWidth / width})`;
    stage.style.height = `${stage.clientWidth * height / width}px`;
  }

  function renderStage(stage, scene, side) {
    stage.replaceChildren();
    stage.style.height = "";
    stage.removeAttribute("role");
    const reference = getBaseline(scene, baseline);
    if (side === "before" && reference.image) {
      const image = document.createElement("img");
      image.src = reference.image;
      image.alt = `${reference.title} · ${scene.label} · ${reference.provenance}`;
      image.addEventListener("error", () => {
        stage.textContent = "기준 이미지를 불러오지 못했습니다. 로컬 이미지 경로를 확인하세요.";
        stage.setAttribute("role", "alert");
      }, { once: true });
      stage.append(image);
      return;
    }
    stage.innerHTML = side === "before" ? scene.before() : scene.after();
    const mock = stage.querySelector(".mock");
    mock.classList.toggle("refined", side === "after");
    mock.dataset.width = String(scene.width || 1440);
    mock.dataset.height = String(scene.height || 900);
    fitStage(stage);
  }

  function renderChanges(scene) {
    byId("change-rows").replaceChildren();
    for (const change of scene.changes) {
      const row = document.createElement("tr");
      for (const value of change) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      byId("change-rows").append(row);
    }
  }

  function selectScene(id) {
    const found = scenes.find((scene) => scene.id === id);
    selected = found || scenes[0];
    byId("navigation-status").textContent = found || !id ? "" : "알 수 없는 화면입니다. 요청·범위 비교를 표시합니다.";
    byId("scene-title").textContent = selected.title;
    byId("scene-description").textContent = selected.description;
    const reference = getBaseline(selected, baseline);
    byId("before-provenance").textContent = reference.provenance;
    byId("before-title").textContent = reference.title;
    byId("visual-note").textContent = `미감 보완: ${selected.visualNote}`;
    for (const side of ["before", "after"]) {
      renderStage(byId(`${side}-stage`), selected, side);
      byId(`${side}-note`).textContent = side === "before" ? reference.note : selected.afterNote;
    }
    renderChanges(selected);
    byId("verification").textContent = "구현 후 확인: 원문·승인·전송 규칙을 유지하고, 같은 과업에서 전환·선택·포커스·초안 보존을 실제 앱으로 검증합니다. 목업만으로 개선 효과를 확정하지 않습니다.";
    for (const button of byId("scene-navigation").children) {
      button.setAttribute("aria-pressed", String(button.dataset.scene === selected.id));
    }
  }

  function setView(view) {
    if (!["both", "before", "after"].includes(view)) return;
    byId("comparison").dataset.view = view;
    for (const button of document.querySelectorAll("button[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    }
    for (const stage of document.querySelectorAll(".stage")) fitStage(stage);
  }

  function enlarge(side, trigger) {
    if (!["before", "after"].includes(side)) return;
    returnFocus = trigger;
    byId("enlarged-title").textContent = `${side === "before" ? getBaseline(selected, baseline).title : "TO-BE"} · ${selected.label}`;
    dialog.showModal();
    renderStage(byId("enlarged-stage"), selected, side);
    byId("close-enlarged").focus();
  }

  function initialize() {
    for (const scene of scenes) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.scene = scene.id;
      button.textContent = scene.label;
      button.addEventListener("click", () => { location.hash = scene.id; });
      byId("scene-navigation").append(button);
    }
    for (const button of document.querySelectorAll("button[data-view]")) {
      button.addEventListener("click", () => setView(button.dataset.view));
    }
    for (const button of document.querySelectorAll("[data-baseline]")) {
      button.addEventListener("click", () => {
        baseline = button.dataset.baseline === "design" ? "design" : "current";
        document.querySelectorAll("[data-baseline]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.baseline === baseline)));
        selectScene(selected.id);
      });
    }
    for (const button of document.querySelectorAll("[data-enlarge]")) {
      button.addEventListener("click", () => enlarge(button.dataset.enlarge, button));
    }
    byId("close-enlarged").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => returnFocus?.focus());
    window.addEventListener("hashchange", () => selectScene(location.hash.slice(1)));
    const observer = new ResizeObserver((entries) => entries.forEach(({ target }) => fitStage(target)));
    document.querySelectorAll(".stage").forEach((stage) => observer.observe(stage));
    selectScene(location.hash.slice(1));
  }
  initialize();
})();
