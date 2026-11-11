import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import { resizeContent } from "./support/tobe-fixture.mjs";

const artifacts = ".artifacts/workspace-followup";
const content = "완료 문서 복구 검증";
async function open(name) {
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await title(name);
}
async function title(name) {
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
}
async function panelWidth() {
  return browser.execute(
    () => document.querySelector(".workspace-panel").offsetWidth,
  );
}
async function removeLocal() {
  await $('button[aria-label="새 문서 목록에서 제거"]').click();
  await $(".document-removal-notice").waitForDisplayed();
  await $(".sidebar > ul").$("button=document").click();
  await title("document");
}
async function showCompleted() {
  await $(".completed-documents > summary").click();
  await $(
    '.completed-documents button[aria-label="새 문서 다시 열기"]',
  ).waitForDisplayed();
}

describe("완료 문서 복구와 패널 상태 회귀", () => {
  before(async () => {
    await mkdir(artifacts, { recursive: true });
    await resizeContent(1440, 900);
  });
  it("문서를 바꾸고 돌아와도 조절한 너비를 유지한다", async () => {
    await open("document");
    await $(".panel-resize-request").click();
    await browser.keys("End");
    const width = await panelWidth();
    assert.equal(width, 600);
    await open("rewrite");
    assert.equal(await panelWidth(), width);
    await $(".sidebar > ul").$("button=document").click();
    await title("document");
    assert.equal(await panelWidth(), width);
  });
  it("문서를 전환해도 닫아 둔 요청 패널을 다시 열지 않는다", async () => {
    if (await $(".workspace-panel").isDisplayed())
      await $(".workspace-controls button").click();
    await $(".sidebar > ul").$("button=rewrite").click();
    await title("rewrite");
    assert.equal(await $(".workspace-panel").isDisplayed(), false);
    await $(".sidebar > ul").$("button=document").click();
    await title("document");
    assert.equal(await $(".workspace-panel").isDisplayed(), false);
    await $(".workspace-controls button").click();
    assert.equal(await panelWidth(), 600);
  });
  it("이동 후에도 완료 목록에서 내부 문서의 내용과 이력을 복구한다", async () => {
    await $("button=새 문서").click();
    await title("새 문서");
    await $('[data-testid="source-editor"]').click();
    await $('[data-testid="source-editor"]').addValue(content);
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
    );
    const snapshot = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    const saved = await editor({
      kind: "read",
      documentId: snapshot.selectedDocumentId,
    });
    await removeLocal();
    await showCompleted();
    await browser.saveScreenshot(`${artifacts}/completed.png`);
    await $(
      '.completed-documents button[aria-label="새 문서 다시 열기"]',
    ).click();
    await title("새 문서");
    const restored = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    assert.equal(restored.selectedDocumentId, saved.document.id);
    assert.equal(await readFile(saved.document.path, "utf8"), content);
    assert.deepEqual(
      (await editor({ kind: "read", documentId: saved.document.id })).versions,
      saved.versions,
    );
    await removeLocal();
    await writeFile(
      join(root, "workspace-followup.json"),
      JSON.stringify(saved),
    );
  });
});
