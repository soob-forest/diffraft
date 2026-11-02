import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import { selectSource } from "./support/source-ui.mjs";

describe("원문 선택 초안 재실행", () => {
  it("묶음 없는 원문 대상을 자동 실행 없이 복원한다", async () => {
    const { fixture } = JSON.parse(
      await readFile(join(root, "popover-expected.json"), "utf8"),
    );
    await $("button=선택 수정 초안 이어쓰기").waitForDisplayed();
    await $("button=선택 수정 초안 이어쓰기").click();
    await $(".source-selection-panel textarea").waitForDisplayed();
    assert.equal(
      await $(".source-selection-panel textarea").getValue(),
      "재실행 뒤 이어 쓸 지시",
    );
    assert.equal(await $(".selection-confirmation").isExisting(), false);
    const records = await editor({ kind: "read_drafts" });
    const index = JSON.parse(
      records.find(
        (value) =>
          value.key ===
          JSON.stringify([
            "selected-request",
            fixture.document.id,
            fixture.task.id,
            "source-active",
          ]),
      ).valueJson,
    );
    const value = JSON.parse(
      records.find((record) => record.key === index.key).valueJson,
    );
    assert.equal(value.target.kind, "confirmed");
    assert.equal(value.target.batchId, undefined);
    assert.equal(JSON.parse(index.key).length, 6);
  });
});

describe("첫 원문 선택 요청과 변경된 원문", () => {
  afterEach(async function () {
    if (this.currentTest.state !== "failed") return;
    await browser.saveScreenshot(
      ".artifacts/selection-popover/restart-failure.png",
    );
  });
  it("작업 생성 취소·재진입을 보존하고 작업을 하나만 만들며 자동 실행하지 않는다", async () => {
    await firstSourceSetup();
    await createFirstSourceTask();
  });
  it("원문이 바뀌면 오래된 대상을 실행하지 않고 지시를 보존한다", async () => {
    await $(".source-selection-panel").$("button=원문으로 돌아가기").click();
    await browser.keys([Key.Command, Key.ArrowDown]);
    await browser.keys(" 추가한 원문");
    await $("button=선택 수정 초안 이어쓰기").click();
    await browser.waitUntil(async () =>
      (await $(".source-selection-panel").getText()).includes(
        "원문이 변경되었습니다",
      ),
    );
    assert.equal(
      await $(".source-selection-panel textarea").getValue(),
      "선택만 간결하게",
    );
    assert.equal(
      await $(".source-selection-panel button[type=submit]").isEnabled(),
      false,
    );
    await browser.saveScreenshot(
      ".artifacts/selection-popover/stale-source.png",
    );
  });
});

async function firstSourceSetup() {
  await $(".source-selection-panel").$("button=원문으로 돌아가기").click();
  await $(".document-actions").$("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $("[data-testid=source-editor]").waitForDisplayed();
  await $("[data-testid=source-editor]").click();
  await browser.keys("보존할 문장입니다.");
  await selectSource("보존할 문장입니다.");
  await browser.keys([Key.Shift, Key.F10]);
  await browser.waitUntil(() =>
    browser.execute(() =>
      document.activeElement?.matches(".selection-context button"),
    ),
  );
  await browser.keys(Key.Escape);
  await browser.execute(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(await $(".selection-context").isExisting(), false);
  assert.equal(
    await browser.execute(() =>
      document.activeElement?.matches('[data-testid="source-editor"]'),
    ),
    true,
  );
  await browser.keys([Key.Shift, Key.F10]);
  await browser.waitUntil(() =>
    browser.execute(() =>
      document.activeElement?.matches(".selection-context button"),
    ),
  );
  // Embedded key events do not activate the browser's native button default.
  // OS Enter activation is checked separately in the ordinary release.
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".source-selection-panel textarea").waitForDisplayed();
}
async function createFirstSourceTask() {
  const fields = await $$(".source-selection-panel textarea");
  await fields[0].setValue("첫 선택 목표");
  await fields[1].setValue("선택만 간결하게");
  await $(".source-selection-panel").$("button=원문으로 돌아가기").click();
  await selectSource("보존할 문장입니다.");
  await $(".selection-context").$("button=이 부분 수정").click();
  assert.equal(
    await $(".source-selection-panel textarea").getValue(),
    "첫 선택 목표",
  );
  await $("button=작업 만들고 선택 수정 계속").doubleClick();
  await $(".source-selection-panel .quote-text").waitForDisplayed();
  assert.equal(
    await $(".source-selection-panel textarea").getValue(),
    "선택만 간결하게",
  );
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const state = await editor({
    kind: "read",
    documentId: snapshot.selectedDocumentId,
  });
  assert.equal(state.tasks.length, 1);
  const page = await invoke("task_conversation", {
    request: { schemaVersion: 1 },
    taskId: state.selectedTaskId,
    before: null,
  });
  assert.equal(page.lastAttempt, null);
  await $(".source-selection-panel").$("button=요청 내용 확인").click();
  await $(".selection-confirmation").waitForDisplayed();
  await browser.keys(Key.Escape);
  assert.equal(await $(".selection-confirmation").isExisting(), false);
}
