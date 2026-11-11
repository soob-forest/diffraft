import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { holdDatabase } from "./support/database-lock.mjs";
import { documentAction } from "./support/document-menu.mjs";
import { resizeContent } from "./support/tobe-fixture.mjs";

const root = process.env.DOCREVIEW_E2E_DATA;
const artifacts = ".artifacts/workspace-panels";
const documentToggle = '.app-header button[aria-controls="document-list"]';
async function open(name) {
  await writeFile(join(root, "next-pick"), name);
  if (!(await $(".sidebar").isDisplayed())) await $(documentToggle).click();
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
}
async function width(selector) {
  return browser.execute(
    (selector) =>
      document.querySelector(selector).getBoundingClientRect().width,
    selector,
  );
}
async function key(selector, key) {
  await $(selector).click();
  await browser.keys(key);
}
async function drag(selector, delta) {
  const rect = await browser.execute((selector) => {
    const bounds = document.querySelector(selector).getBoundingClientRect();
    return {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + Math.min(150, bounds.height / 2)),
    };
  }, selector);
  await browser.performActions([
    {
      type: "pointer",
      id: "resize",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", duration: 0, ...rect },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: 200, x: rect.x + delta, y: rect.y },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

describe("문서 정리와 작업 공간 패널", () => {
  before(async () => {
    await mkdir(artifacts, { recursive: true });
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(`${artifacts}/failure.png`);
  });
  it("AI 설정을 오른쪽 위에서 열고 닫으면 진입 버튼으로 돌아온다", async () => {
    await resizeContent(1440, 900);
    assert.equal(await $(".sidebar .settings-trigger").isExisting(), false);
    await $('.app-settings button[aria-label="AI 연결 설정"]').click();
    await $(".connection-dialog").waitForDisplayed();
    await $("button=설정 닫기").click();
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.activeElement?.classList.contains("settings-trigger"),
      ),
    );
  });

  it("문서 목록과 요청 패널을 드래그·키보드로 조절하고 닫았다 다시 연다", async () => {
    await open("document");
    const before = await width(".sidebar");
    await drag(".panel-resize-documents", 64);
    assert.ok((await width(".sidebar")) > before + 40);
    await key(".panel-resize-documents", "Home");
    assert.equal(Math.round(await width(".sidebar")), 160);
    await $(documentToggle).click();
    assert.equal(await $(".sidebar").isDisplayed(), false);
    await $(documentToggle).click();
    assert.equal(Math.round(await width(".sidebar")), 160);
    await key(".panel-resize-request", "Home");
    const requestBefore = await width(".workspace-panel");
    await drag(".panel-resize-request", -80);
    assert.ok((await width(".workspace-panel")) > requestBefore + 60);
    const retained = await width(".workspace-panel");
    await $(".panel-return").click();
    assert.equal(await $(".workspace-panel").isDisplayed(), false);
    await $(".workspace-controls button").click();
    assert.equal(
      Math.round(await width(".workspace-panel")),
      Math.round(retained),
    );
    await $(".version-history > summary").click();
    await browser.execute(() => {
      document.querySelector(".version-history").style.height = "300px";
    });
    await $(".version-history > summary").click();
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          document.querySelector(".version-history").getBoundingClientRect()
            .height < 100,
      ),
    );
    await mkdir(artifacts, { recursive: true });
    await browser.saveScreenshot(`${artifacts}/wide.png`);
  });

  it("좁은 창에서 보조 패널과 본문을 왕복하고 가로 넘침을 만들지 않는다", async () => {
    await resizeContent(800, 900);
    assert.equal(await $(".sidebar").isDisplayed(), false);
    await $(documentToggle).click();
    assert.equal(await $(".sidebar").isDisplayed(), true);
    await $('button[aria-label="문서 목록 닫기"]').click();
    await browser.saveScreenshot(`${artifacts}/compact.png`);
    const overflow = await browser.execute(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    await resizeContent(680, 900);
    assert.equal(await $(".panel-resize-request").isDisplayed(), false);
    await $(".panel-return").click();
    await $('[data-testid="source-editor"]').waitForDisplayed();
    await $(".workspace-controls button").click();
    await $(".workspace-panel").waitForDisplayed();
    await browser.saveScreenshot(`${artifacts}/single-pane.png`);
    await resizeContent(1440, 900);
  });

  it("제거 중 저장 실패에는 현재 문서와 목록을 유지하고 재시도할 수 있다", async () => {
    const release = await holdDatabase();
    try {
      await $('[data-testid="source-editor"]').click();
      await $('[data-testid="source-editor"]').addValue("저장 실패 입력 보존");
      await documentAction("document", "완료로 이동");
      await $(".workspace-body > .error-banner").waitForDisplayed();
      assert.equal(await $(".document-toolbar h1").getText(), "document");
      assert.equal(
        await $('.document-list-row button[aria-current="page"]').getText(),
        "document",
      );
    } finally {
      await release();
    }
    await $("button=저장 다시 시도").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
    );
  });

  it("완료 문서를 제거해도 파일과 기록을 보존한다", async () => {
    const original = await readFile(join(root, "document.md"), "utf8");
    const initial = await browser.execute(() =>
      window.__TAURI__.core.invoke("get_workspace_snapshot", {
        request: { schemaVersion: 1 },
      }),
    );
    await documentAction("document", "완료로 이동");
    await $(".empty-state").waitForDisplayed();
    await $(".document-removal-notice").waitForDisplayed();
    assert.equal(await readFile(join(root, "document.md"), "utf8"), original);
    await $(".document-removal-notice button").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    await documentAction("document", "완료로 이동");
    await $(".empty-state").waitForDisplayed();
    await writeFile(
      join(root, "workspace-panels-expected.json"),
      JSON.stringify({ original, documents: initial.documents }),
    );
  });
});
