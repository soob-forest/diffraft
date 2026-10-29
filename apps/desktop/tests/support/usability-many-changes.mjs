import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTask } from "./generation-fixture.mjs";
import { editor, invoke, root } from "./review-fixture.mjs";

const CHANGE_COUNT = 100;
export async function checkManyChanges() {
  const source = await prepareManyChanges();
  await checkNavigation();
  assert.equal(await readFile(join(root, "layout.md"), "utf8"), source);
}

async function prepareManyChanges() {
  const source = [
    "# 많은 변경 검토",
    ...Array.from({ length: CHANGE_COUNT }, (_, index) =>
      [
        `변경할 문단 ${index + 1}.`,
        ...Array.from(
          { length: 8 },
          (_, gap) => `보존할 문맥 ${index + 1}-${gap + 1}.`,
        ),
      ].join("\n\n"),
    ),
  ].join("\n\n");
  await writeFile(join(root, "layout.md"), source);
  await writeFile(join(root, "next-pick"), "layout");
  if ((await $("button=문서 목록").getAttribute("aria-expanded")) === "false")
    await $("button=문서 목록").click();
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "layout",
  );
  const taskId = await createTask("긴 제목의 작업 목표 ".repeat(12));
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = snapshot.documents.find((value) => value.title === "layout");
  await registerChanges(document, taskId);
  return source;
}

async function registerChanges(document, taskId) {
  const scope = await editor({
    kind: "scope",
    documentId: document.id,
    expectedVersion: document.headVersion,
    selection: { kind: "whole" },
  });
  const changes = scope.blocks
    .filter((block) => block.text.startsWith("변경할 문단"))
    .map((block) => ({
      block_id: block.id,
      before: block.text.trimEnd(),
      after: block.text.trimEnd().replace("변경할", "수정한"),
      reason: "합성 검토 fixture",
    }));
  assert.equal(changes.length, CHANGE_COUNT);
  await invoke("e2e_register_ai", {
    documentId: document.id,
    taskId,
    responseJson: JSON.stringify({
      schema_version: 1,
      mode: "PATCH",
      summary: "100개 독립 변경",
      changes,
    }),
  });
}

async function checkNavigation() {
  await $("button=변경 검토").click();
  await $(".navigation-more > summary").click();
  const picker = $('select[aria-label="변경 그룹 선택"]');
  await picker.waitForDisplayed();
  assert.equal((await picker.$$("option")).length, CHANGE_COUNT);
  await browser.execute((index) => {
    const select = document.querySelector(
      'select[aria-label="변경 그룹 선택"]',
    );
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, CHANGE_COUNT - 1);
  await browser.waitUntil(async () =>
    (await $(".selected-group h3").getText()).includes("100 / 100"),
  );
  await $(".navigation-more > summary").click();
  await $("button=다음 변경").click();
  assert.match(await $(".selected-group h3").getText(), /선택 1 \/ 100/);
  await browser.saveScreenshot(".artifacts/usability/many-changes.png");
  await $("button=남은 제안 전체 승인").click();
  await $(".approval-dialog").waitForDisplayed();
  assert.match(await $(".approval-dialog").getText(), /100/);
  await browser.saveScreenshot(".artifacts/usability/bulk-confirm.png");
  await $(".approval-dialog").$("button=취소").click();
}
