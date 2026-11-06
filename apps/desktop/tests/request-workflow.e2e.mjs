import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseRequestMode,
  showTaskPanel,
} from "./support/generation-fixture.mjs";
import { inspectRequestLayouts } from "./support/request-workflow-layout.mjs";
import { editor, invoke, root } from "./support/review-fixture.mjs";

async function currentState() {
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  return editor({ kind: "read", documentId: workspace.selectedDocumentId });
}
async function saved() {
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
}
describe("요청 중심 최초 진입", () => {
  afterEach(async function () {
    if (this.currentTest.state === "failed") {
      await browser.saveScreenshot(
        ".artifacts/request-workflow/failed-first.png",
      );
      await writeFile(
        ".artifacts/request-workflow/failed-first.json",
        JSON.stringify(
          await browser.execute(() => ({
            texts: [
              ...document.querySelectorAll(
                "[role=alert],.generation-panel>[role=status]",
              ),
            ].map((n) => n.textContent),
            first: !!document.querySelector(".first-request"),
            dialogs: document.querySelectorAll("dialog").length,
          })),
        ),
      );
    }
  });
  before(async () => {
    await mkdir(".artifacts/request-workflow", { recursive: true });
  });
  it(
    "목표 없이 목적·방식을 바꾸며 확인 취소에도 같은 작업과 지시를 유지한다",
    verifyNoGoalFirstRequest,
  );
  it(
    "보관 실패는 작업을 만들지 않고 입력을 유지하며 재시작 전 초안을 보관한다",
    verifyFirstDraftFailure,
  );
});

async function verifyNoGoalFirstRequest() {
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () =>
      (await $('[data-testid="workspace-status"]').getText()) ===
      "로컬 작업 공간",
  );
  await showTaskPanel();
  assert.equal((await currentState()).tasks.length, 0);
  assert.equal(
    await $(".first-request button[type=submit]").isEnabled(),
    false,
  );
  await prepareFirstModes();
  const state = await currentState();
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].goal, "");
  assert.equal(state.tasks[0].name, "새 작업");
  await inspectFirstModeDrafts(state.tasks[0].id);
  await inspectRequestLayouts("first-request");
  await browser.saveScreenshot(
    ".artifacts/request-workflow/first-confirm-cancel.png",
  );
}
async function prepareFirstModes() {
  await $(".first-request .request-form textarea").setValue("처음 수정 지시");
  await chooseRequestMode("EXPLAIN");
  await $(".request-form textarea").setValue("처음 질문 지시");
  await chooseRequestMode("REWRITE");
  await $(".request-form textarea").setValue("처음 전체 초안 지시");
  assert.equal(
    await $(".request-form textarea").getValue(),
    "처음 전체 초안 지시",
  );
  assert.equal(await $('select[aria-label="수정 방식"]').getValue(), "REWRITE");
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(
    await $(".generation-dialog").getText(),
    /전체 적용 또는 변경별 검토/,
  );
}
async function inspectFirstModeDrafts(taskId) {
  await $("button=요청 취소").click();
  await chooseRequestMode("EXPLAIN");
  assert.equal(await $(".request-form textarea").getValue(), "처음 질문 지시");
  await chooseRequestMode("PATCH");
  assert.equal(await $(".request-form textarea").getValue(), "처음 수정 지시");
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await $("button=요청 취소").click();
  assert.equal((await currentState()).tasks.length, 1);
  const page = await invoke("task_conversation", {
    request: { schemaVersion: 1 },
    taskId,
    before: null,
  });
  assert.equal(page.lastAttempt, null);
}

async function verifyFirstDraftFailure() {
  await $("button=새 문서").click();
  await $(".first-request .request-form textarea").waitForDisplayed();
  const database = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    database,
    "CREATE TRIGGER deny_first_request BEFORE INSERT ON first_request_drafts BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  ]);
  try {
    await $(".request-form textarea").setValue("재시작까지 보존할 첫 요청");
    await $(".request-form button[type=submit]").click();
    await browser.waitUntil(async () =>
      (await $(".first-request").getText()).includes("저장할 수 없습니다"),
    );
    assert.equal((await currentState()).tasks.length, 0);
    assert.equal(
      await $(".request-form textarea").getValue(),
      "재시작까지 보존할 첫 요청",
    );
  } finally {
    execFileSync("/usr/bin/sqlite3", [
      database,
      "DROP TRIGGER deny_first_request;",
    ]);
  }
  await chooseRequestMode("REWRITE");
  await $(".request-form textarea").setValue("재시작할 전체 초안");
  await saved();
  const state = await currentState();
  assert.equal(state.tasks.length, 0);
  await writeFile(
    join(root, "workflow-restart.json"),
    JSON.stringify({
      documentId: state.document.id,
      pid: await invoke("e2e_process_id", {}),
    }),
  );
  await browser.saveScreenshot(
    ".artifacts/request-workflow/first-persisted.png",
  );
}
