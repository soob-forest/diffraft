import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, examples, invoke, root } from "./review-fixture.mjs";

export { editor, examples, invoke, root };
export const confirmed = await readFile(
  new URL("confirmed_v14.md", examples),
  "utf8",
);
export const candidate = await readFile(
  new URL("rewrite_W02.md", examples),
  "utf8",
);
export async function reviewState(taskId) {
  return (
    await invoke("review_command", {
      request: { schemaVersion: 1, action: { kind: "state", taskId } },
    })
  ).value;
}
export async function version(number) {
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === `v${number}`,
  );
}
export async function prepareRewrite() {
  await writeFile(join(root, "next-pick"), "rewrite");
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "rewrite",
  );
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = workspace.documents.find((item) => item.title === "rewrite");
  for (let number = 1; number < 14; number++)
    await editor({
      kind: "save",
      documentId: document.id,
      expectedVersion: number,
      content: confirmed,
      operationId: crypto.randomUUID(),
    });
  const task = await editor({
    kind: "put_task",
    task: {
      id: crypto.randomUUID(),
      documentId: document.id,
      goal: "상황별 실행 가이드",
      pinnedRules: "수치 유지",
      summary: "",
    },
  });
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".sidebar").$("button=rewrite").click();
  await version(14);
  await $("button=변경 검토").click();
  return { document, task };
}
export async function requestRewrite(reference = false) {
  if ((await $(".rewrite-form").getAttribute("open")) === null)
    await $(".rewrite-form summary").click();
  await browser.waitUntil(
    async () => await $(".rewrite-form textarea").isEnabled(),
  );
  await $(".rewrite-form textarea").setValue(
    "상황별로 바로 실행할 수 있게 전체 문서를 정리해 주세요.",
  );
  await $(
    `button=${reference ? "이 후보의 다른 방향 요청" : "현재 확정본 재작성"}`,
  ).click();
  await $(".rewrite-request-dialog").waitForDisplayed();
  await browser.waitUntil(
    async () => await $(".rewrite-request-dialog .primary").isEnabled(),
  );
}
export async function start(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $(".rewrite-request-dialog .primary").click();
}
export async function waitCandidate(taskId, count) {
  await browser.waitUntil(async () => {
    const state = await reviewState(taskId);
    return !state.generating && state.batches.length === count;
  });
  await browser.waitUntil(
    async () => !(await $(".rewrite-request-dialog").isExisting()),
  );
  await $('[data-testid="comparison-stats"]').waitForDisplayed();
  return (await reviewState(taskId)).batches.find(
    (batch) => batch.status === "ACTIVE",
  );
}
export async function choose(id) {
  await browser.execute((value) => {
    const select = document.querySelector(".review-header select");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(
    async () => await $("button=이전 안 선택").isExisting(),
  );
  await browser.waitUntil(
    async () => await $("button=이전 안 선택").isEnabled(),
  );
}
export async function decide(button, confirmation) {
  await browser.waitUntil(async () => await $(`button=${button}`).isEnabled());
  await $(`button=${button}`).click();
  await $(".batch-decision-dialog").waitForDisplayed();
  await $(`button=${confirmation}`).click();
  await browser.waitUntil(
    async () => !(await $(".batch-decision-dialog").isExisting()),
  );
}
