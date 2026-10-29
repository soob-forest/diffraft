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
  await browser.execute((id) => {
    const select = document.querySelector(".task-picker select");
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(async () =>
    browser.execute((id) => {
      const select = document.querySelector(".task-picker select");
      const goal = document.querySelector(
        ".task-conditions textarea[required]",
      );
      const button = document.querySelector(
        ".task-conditions button[type='submit']",
      );
      return (
        document.querySelectorAll(".task-conditions").length === 1 &&
        select.value === id &&
        goal.value === (id ? select.selectedOptions[0].textContent : "") &&
        button.textContent === (id ? "조건 저장" : "작업 만들기")
      );
    }, id),
  );
}
export async function createTask(goal) {
  await chooseTask("");
  await $(".task-conditions textarea[required]").setValue(goal);
  await $("button=작업 만들기").click();
  await browser.waitUntil(
    async () => (await $(".task-picker select").getValue()) !== "",
  );
  return $(".task-picker select").getValue();
}
export async function beginRequest(mode, fixture, instruction) {
  await showTaskPanel();
  await browser.waitUntil(
    async () => await $(".request-kind button").isEnabled(),
  );
  await $(mode === "EXPLAIN" ? "button=설명만" : "button=수정 제안").click();
  await $(".request-form textarea").setValue(instruction);
  await $("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), fixture);
  await $("button=확인 후 요청").click();
}
export async function terminal(taskId, previousJob = null) {
  await browser.waitUntil(async () => {
    const last = (await conversation(taskId)).lastAttempt;
    return (
      last &&
      last.jobId !== previousJob &&
      ["SUCCEEDED", "FAILED", "CANCELLED"].includes(last.status)
    );
  });
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
  const open = await $("button=작업·AI 요청 열기");
  if (await open.isExisting()) await open.click();
  const tab = await $("button=작업·대화");
  if (await tab.isExisting()) await tab.click();
}
