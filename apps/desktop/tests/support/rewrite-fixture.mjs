import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, examples, invoke, root } from "./review-fixture.mjs";
import { openReviewOptions } from "./review-ui.mjs";

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
export async function prepareRewrite(name = "rewrite", content = confirmed) {
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = workspace.documents.find((item) => item.title === name);
  for (let number = 1; number < 14; number++)
    await editor({
      kind: "save",
      documentId: document.id,
      expectedVersion: number,
      content,
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
  await $(".sidebar").$(`button=${name}`).click();
  await version(14);
  await $("button=변경 검토").click();
  return { document, task };
}
export async function requestRewrite(reference = false) {
  await openReviewOptions();
  await $(
    `button=${reference ? "이 후보를 참고해 다른 방향 만들기" : "확정본 전체에서 새 초안 요청"}`,
  ).click();
  await $(".request-form textarea").waitForDisplayed();
  await $(".request-form textarea").waitForEnabled();
  await $(".request-form textarea").setValue(
    "상황별로 바로 실행할 수 있게 전체 문서를 정리해 주세요.",
  );
  await $(".request-form").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await $(".generation-dialog").$("button=확인 후 요청").waitForEnabled();
}
export async function start(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $(".generation-dialog").$("button=확인 후 요청").click();
}
export async function holdRewriteRequest(inspect) {
  await rm(join(root, "rewrite-ready"), { force: true });
  await rm(join(root, "rewrite-release"), { force: true });
  await writeFile(join(root, "rewrite-hold"), "hold");
  await start("REWRITE_DELAY");
  try {
    await browser.waitUntil(async () => {
      try {
        return (
          (await readFile(join(root, "rewrite-ready"), "utf8")) === "ready"
        );
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    });
    return await inspect();
  } finally {
    await writeFile(join(root, "rewrite-release"), "release");
  }
}
export async function waitCandidate(taskId, count) {
  await browser.waitUntil(async () => {
    const state = await reviewState(taskId);
    return !state.generating && state.batches.length === count;
  });
  await browser.waitUntil(
    async () => !(await $(".generation-dialog").isExisting()),
  );
  await $('[data-testid="comparison-stats"]').waitForDisplayed();
  return (await reviewState(taskId)).batches.find(
    (batch) => batch.status === "ACTIVE",
  );
}
export async function choose(id) {
  await openReviewOptions();
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
