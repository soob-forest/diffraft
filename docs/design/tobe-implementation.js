"use strict";
const scenes = [
  {id:"request",title:"요청·범위",note:"document · v2 · 사실과 수치 유지 · 미전송 요청 · 원문 모드",tasks:"TB1 / TB2"},
  {id:"review",title:"비교·승인",note:"review · v12 · 미승인3개 · 첫 변경 선택 · 인라인·기본 문맥",tasks:"TB3"},
  {id:"comment",title:"코멘트·초안",note:"같은 v12 · 두 번째10→5분 제안 · 제안 쪽 인용 · 미등록 코멘트",tasks:"TB4"},
  {id:"resume",title:"재개·회복",note:"같은 v12 · 미처리3개 · 원문 모드로 복귀. 실패·적용 상태는 아래 분기 증거와 구분",tasks:"TB5"},
  {id:"narrow",title:"좁은 창",note:"document · v2 ·800×600 · 목록 접힘 · 원문과290px 요청 패널 동시 표시",tasks:"TB6",width:800,height:600},
  {id:"connection",title:"연결 설정",note:"document · v2 · 가짜 CLI 연결 테스트 성공 · 진단 접힘 · 실제 계정/유료 호출 없음",tasks:"TB7"},
];
const labels = {target:"고정 TO-BE · 합성 목표",before:"이번 변경 전 · 실제 앱",after:"새 구현 · 실제 앱"};
const navigation = document.querySelector("#scenes"), view = document.querySelector("#view");
const dialog = document.querySelector("#zoom");
let previousFocus;
for (const scene of scenes) {
  const button = document.createElement("button");
  button.type = "button"; button.textContent = scene.title; button.dataset.scene = scene.id;
  button.addEventListener("click", () => { location.hash = scene.id; });
  navigation.append(button);
}
function showCapture(scene, phase) {
  const figure = document.createElement("figure"), caption = document.createElement("figcaption");
  caption.textContent = labels[phase]; figure.append(caption);
  const path = `tobe-captures/${phase}/${scene.id}`;
  const button = document.createElement("button"), window = document.createElement("span"), image = document.createElement("img");
  button.type = "button"; button.className = "capture"; button.setAttribute("aria-label", `${scene.title} · ${labels[phase]} 확대`);
  window.className = "capture-window"; window.style.setProperty("--w",scene.width || 1440); window.style.setProperty("--h",scene.height || 900);
  image.src = `${path}.png`; image.alt = `${scene.title} · ${labels[phase]}`;
  window.append(image); button.append(window); figure.append(button);
  button.addEventListener("click", () => {
    previousFocus = button;
    document.querySelector("#zoom-title").textContent = image.alt;
    const enlarged = document.querySelector("#zoom-image"); enlarged.src = image.src; enlarged.alt = image.alt;
    dialog.showModal(); document.querySelector("#close").focus();
  });
  const meta = document.createElement("div"); meta.className = "meta";
  for (const [suffix,label] of [["png","원본 PNG"],["json","계산 치수·상태"]]) {
    const link = document.createElement("a"); link.href = `${path}.${suffix}`; link.textContent = label; meta.append(link);
  }
  figure.append(meta); return figure;
}
function render() {
  const scene = scenes.find(item => item.id === location.hash.slice(1)) || scenes[0];
  document.querySelector("#scene-title").textContent = scene.title;
  document.querySelector("#scene-note").textContent = scene.note;
  document.querySelector("#evidence").textContent = `${scene.tasks} · 콘텐츠 ${scene.width || 1440}×${scene.height || 900} ·100% · 합성 fixture. 판정과 허용 차이는 실행 기록의 TB-G2 표를 확인하세요.`;
  for (const button of navigation.children) button.setAttribute("aria-current",button.dataset.scene === scene.id ? "page" : "false");
  const captures = document.querySelector("#captures"); captures.dataset.view = view.value === "all" ? "all" : "single";
  captures.replaceChildren(...(view.value === "all" ? ["target","before","after"] : [view.value]).map(phase => showCapture(scene,phase)));
}
view.addEventListener("change",render); window.addEventListener("hashchange",render);
document.querySelector("#close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => previousFocus?.focus());
for (const [id,label] of [["review-long-table","긴 표 · 검토"],["comment-long-table","긴 표 · 코멘트"],["request-failed","실패 요청 수정"],["applied-version","적용 전 비교"],["resume-v13","독립 v13/D03 r2 재시작"]]) {
  const item = document.createElement("li"), link = document.createElement("a"); link.href = `tobe-captures/states/${id}.png`; link.textContent = label; item.append(link); document.querySelector("#states").append(item);
}
for (const width of [800,1280,1440]) for (const scale of [1,1.5,2]) {
  const item = document.createElement("li");
  item.append(`${width}×${width===800?600:width===1280?800:900} · ${scale*100}% `);
  for (const [kind,label] of [["review","검토"],["request","요청"]]) {
    const link = document.createElement("a"); link.href = `tobe-captures/states/${kind}-${width}-${scale}.png`; link.textContent = label; item.append(link," ");
  }
  document.querySelector("#zoom-states").append(item);
}
render();
