(() => {
  const screens = globalThis.reimplementationScreens;
  const labels = { target: "디자인 목표 · 정적 시안", before: "재구현 전 · 실제 앱", after: "재구현 후 · 실제 앱" };
  const byId = id => document.getElementById(id);
  let current = screens[0];
  let trigger;
  function zoom(side, button) {
    trigger = button;
    byId("zoom-title").textContent = `${current.title} · ${labels[side]}`;
    byId("zoom-image").src = current[side];
    byId("zoom-image").alt = byId("zoom-title").textContent;
    byId("zoom").showModal();
    byId("close").focus();
  }
  function figure(side) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.append(document.createTextNode(labels[side]));
    const button = document.createElement("button");
    button.textContent = "확대";
    button.setAttribute("aria-label", `${labels[side]} 확대`);
    button.onclick = () => zoom(side, button);
    caption.append(button);
    const image = document.createElement("img");
    image.src = current[side]; image.alt = `${current.title} · ${labels[side]}`;
    image.onerror = () => { image.remove(); const note = document.createElement("p"); note.className = "missing"; note.textContent = "이 상태의 새 캡처는 미확보입니다. 검증 기록을 확인하세요."; figure.append(note); button.disabled = true; };
    figure.append(caption, image);
    return figure;
  }
  function render() {
    const id = location.hash.slice(1);
    current = screens.find(item => item.id === id) || screens[0];
    byId("status").textContent = id && current.id !== id ? "알 수 없는 화면입니다. 첫 화면을 표시합니다." : "";
    byId("screen-title").textContent = `${current.id} · ${current.title}`;
    byId("screen-note").textContent = current.note;
    byId("screen-tasks").textContent = `관련 태스크: ${current.tasks}`;
    const view = byId("view").value;
    byId("comparison").dataset.view = view;
    byId("comparison").replaceChildren(...Object.keys(labels).filter(side => view === "all" || side === view).map(figure));
    for (const button of byId("screens").children) button.setAttribute("aria-pressed", String(button.dataset.screen === current.id));
  }
  for (const item of screens) {
    const button = document.createElement("button"); button.textContent = item.id.split("_")[0]; button.dataset.screen = item.id;
    button.onclick = () => { location.hash = item.id; }; byId("screens").append(button);
  }
  for (const width of [800,1280,1440]) for (const zoom of [1,1.5,2]) {
    const row = document.createElement("p"); row.append(`${width}px · ${zoom*100}%: `);
    for (const [key,label] of [["review","검토"],["request","요청"]]) {
      const link = document.createElement("a"); link.href = `reimplementation-captures/after/usability-${key}-${width}-${zoom}.png`; link.textContent = label; row.append(link," ");
    } byId("responsive-links").append(row);
  }
  byId("view").onchange = render;
  byId("close").onclick = () => byId("zoom").close();
  byId("zoom").addEventListener("close", () => trigger?.focus());
  window.addEventListener("hashchange", render); render();
})();
