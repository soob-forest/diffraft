import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./review-fixture.mjs";

export async function conversation(taskId) {
  return invoke("task_conversation", {
    request: { schemaVersion: 1 },
    taskId,
    before: null,
  });
}
export async function review(taskId) {
  return (
    await invoke("review_command", {
      request: { schemaVersion: 1, action: { kind: "state", taskId } },
    })
  ).value;
}
export async function chooseTask(id) {
  await showTaskPanel();
  await browser.execute(() => {
    document.querySelector(".task-management").open = true;
  });
  await $(".task-picker select").waitForDisplayed();
  await browser.execute((id) => {
    const select = document.querySelector(".task-picker select");
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(
    async () =>
      (await $(".task-picker select").getValue()) === id &&
      (id
        ? await $(".task-conditions").isExisting()
        : await $(".first-request").isDisplayed()),
  );
}
export async function createTask(goal) {
  await chooseTask("");
  await $(".first-request .task-condition-details summary").click();
  await $(".first-request .task-condition-details input").setValue(goal);
  await $(".first-request .task-condition-details textarea").setValue(goal);
  await $(".first-request .request-form textarea").setValue(
    "작업 준비를 위한 합성 지시",
  );
  await $(".first-request .request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await $("button=요청 취소").click();
  await $(".request-form textarea").setValue("");
  return $(".task-picker select").getValue();
}
export async function chooseRequestMode(mode) {
  await $(".request-kind")
    .$(mode === "EXPLAIN" ? "button=질문하기" : "button=수정 제안 받기")
    .click();
  if (mode !== "EXPLAIN")
    await browser.execute((mode) => {
      const select = document.querySelector('select[aria-label="수정 방식"]');
      select.value = mode;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, mode);
}
export async function beginRequest(mode, fixture, instruction) {
  await showTaskPanel();
  await browser.waitUntil(
    async () => await $(".request-kind button").isEnabled(),
  );
  await chooseRequestMode(mode);
  await $(".request-form textarea").setValue(instruction);
  await $("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), fixture);
  await $("button=확인 후 요청").click();
}
export async function terminal(taskId, previousJob = null, timeout = 10000) {
  await browser.waitUntil(
    async () => {
      const last = (await conversation(taskId)).lastAttempt;
      return (
        last &&
        last.jobId !== previousJob &&
        ["SUCCEEDED", "FAILED", "CANCELLED"].includes(last.status)
      );
    },
    { timeout },
  );
  return conversation(taskId);
}
export async function currentDocument() {
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = workspace.documents.find(
    (value) => value.title === "새 문서",
  );
  return (await editor({ kind: "read", documentId: document.id })).document;
}

export async function showTaskPanel() {
  const open = await $("button=AI 요청·변경 상세 열기");
  if (await open.isExisting()) await open.click();
  const tab = await $("button=AI 요청·대화");
  if (await tab.isExisting()) await tab.click();
}
