import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { corruptPreferencesKeepDocumentsUsable } from "./document-preference-recovery.mjs";
import { documentAction } from "./support/document-menu.mjs";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import {
  openFixture,
  registerReview,
  resizeContent,
  travelSource,
} from "./support/tobe-fixture.mjs";

const artifacts = ".artifacts/document-management";
const toggle = '.app-header button[aria-controls="document-list"]';
async function open(name) {
  if (!(await $(".sidebar").isDisplayed())) await $(toggle).click();
  await writeFile(join(root, "next-pick"), name);
  await $(".document-actions").$("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
}
async function completed() {
  const list = $(".completed-documents");
  if ((await list.getAttribute("open")) === null)
    await list.$("summary").click();
}
async function bounds(selector) {
  return browser.execute((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return (
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= innerWidth &&
      rect.bottom <= innerHeight
    );
  }, selector);
}

describe("문서 우클릭·완전 제거·문서 내 탐색", () => {
  before(async () => {
    await mkdir(artifacts, { recursive: true });
    await resizeContent(1440, 900);
    await writeFile(join(root, "rewrite.md"), travelSource);
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(`${artifacts}/failure.png`);
  });
  it("우클릭은 다른 문서를 선택하지 않으며 방향키·Escape·Shift+F10을 지원한다", async () => {
    await open("document");
    await open("rewrite");
    await contextMenu();
    await $(".document-actions-menu").waitForDisplayed();
    assert.equal(await $(".document-toolbar h1").getText(), "rewrite");
    assert.equal(await $(".document-actions-menu p").getText(), "document");
    assert.equal(await bounds(".document-actions-menu"), true);
    await browser.keys(Key.ArrowDown);
    assert.equal(
      await browser.execute(() => document.activeElement.textContent.trim()),
      "완료로 이동",
    );
    await browser.keys(Key.Escape);
    await $(".document-actions-menu").waitForExist({ reverse: true });
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          document.activeElement.getAttribute("aria-label") ===
          "document 문서 작업",
      ),
    );
    await browser.keys([Key.Shift, Key.F10]);
    await $(".document-actions-menu").waitForDisplayed();
    await browser.keys(Key.Tab);
    await $(".document-actions-menu").waitForExist({ reverse: true });
    assert.equal(
      await browser.execute(() => document.activeElement.textContent.trim()),
      "rewrite",
    );
    await $('.document-more[aria-label="document 문서 작업"]').click();
    await browser.saveScreenshot(`${artifacts}/right-click-wide.png`);
    await $(".document-actions-menu").$("button=완료로 이동").click();
    await completed();
    await $(
      '.completed-documents button[aria-label="document 다시 열기"]',
    ).waitForDisplayed();
    assert.equal(await $(".document-toolbar h1").getText(), "rewrite");
  });
  it("다시 열기 저장 실패 시 화면과 저장된 선택을 유지하고 재시도한다", async () => {
    const previous = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    await browser.execute(() => {
      window.restoreListStorage = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "docreview.document-list.v2")
          throw new DOMException("full", "QuotaExceededError");
        return window.restoreListStorage.call(this, key, value);
      };
    });
    try {
      await documentAction("document", "다시 열기");
      await $(".workspace-body > .error-banner").waitForDisplayed();
      const after = await invoke("get_workspace_snapshot", {
        request: { schemaVersion: 1 },
      });
      assert.equal(after.selectedDocumentId, previous.selectedDocumentId);
      assert.equal(await $(".document-toolbar h1").getText(), "rewrite");
      assert.equal(
        await $(
          '.completed-documents button[aria-label="document 다시 열기"]',
        ).isExisting(),
        true,
      );
    } finally {
      await browser.execute(() => {
        Storage.prototype.setItem = window.restoreListStorage;
        delete window.restoreListStorage;
      });
    }
    await documentAction("document", "다시 열기");
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    await documentAction("document", "완료로 이동");
    await completed();
  });
  it("완료 문서를 다시 열 수 있고 완전 제거 취소와 저장 실패 후 재시도를 지원한다", async () => {
    await documentAction("document", "다시 열기");
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    await documentAction("document", "완료로 이동");
    await completed();
    await documentAction("document", "목록에서 완전히 제거…");
    await $(".forget-document-dialog").waitForDisplayed();
    assert.match(
      await $("#forget-description").getText(),
      /파일과 작업 이력은 남습니다/,
    );
    await browser.keys(Key.Escape);
    await $(".forget-document-dialog").waitForExist({ reverse: true });
    assert.equal(
      await $(
        '.completed-documents button[aria-label="document 다시 열기"]',
      ).isExisting(),
      true,
    );
    await documentAction("document", "목록에서 완전히 제거…");
    await assertRemovalWriteFailure();
    await browser.saveScreenshot(`${artifacts}/remove-write-failure.png`);
    await $(".forget-document-dialog").$("button=목록에서 완전히 제거").click();
    await $(".forget-document-dialog").waitForExist({ reverse: true });
    assert.equal(
      await $('.document-more[aria-label="document 문서 작업"]').isExisting(),
      false,
    );
    await saveRemovedDocument();
    assert.equal(await $(".document-toolbar h1").getText(), "rewrite");
  });
  it("문서 목록이 닫혀 있어도 작은 창에서 현재 문서 목차에 접근한다", async () => {
    await resizeContent(800, 600);
    assert.equal(await $(".sidebar").isDisplayed(), false);
    await $(".document-navigation > summary").click();
    await $(".document-navigation .outline").waitForDisplayed();
    assert.equal(await bounds(".navigation-popover"), true);
    assert.equal(await $$(".document-navigation .outline button").length, 4);
    await browser.saveScreenshot(`${artifacts}/outline-compact.png`);
    await $(".document-navigation .outline").$("button*=3. 여행 기록").click();
    if ((await $(".document-navigation").getAttribute("open")) !== null) {
      await $(".document-navigation > summary").click();
    }
    assert.equal(
      await browser.execute(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  });
  it("같은 탐색 위치에서 변경 목록을 열고 변경을 선택한다", async () => {
    await resizeContent(1440, 900);
    const fixture = await openFixture("review", travelSource, 1);
    await registerReview(fixture);
    await resizeContent(800, 600);
    await $(".document-navigation > summary").click();
    await $('.document-navigation [aria-label="변경 그룹"]').waitForDisplayed();
    assert.equal(await bounds(".navigation-popover"), true);
    await browser.saveScreenshot(`${artifacts}/review-navigation-compact.png`);
    await browser.keys(Key.Escape);
    assert.equal(await $(".document-navigation").getAttribute("open"), null);
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.activeElement.matches(".document-navigation > summary"),
      ),
    );
    await $(".document-navigation > summary").click();
    const changes = await $$(
      '.document-navigation [aria-label="변경 그룹"] button',
    );
    assert.equal(changes.length, 3);
    await changes[2].click();
    assert.equal(await changes[2].getAttribute("aria-pressed"), "true");
  });
  it(
    "목록 설정이 손상돼도 문서를 생성·열고 상태 변경은 차단한다",
    corruptPreferencesKeepDocumentsUsable,
  );
});

async function contextMenu() {
  // Embedded clicks do not generate the browser's default contextmenu event.
  const prevented = await browser.execute(() => {
    const button = [...document.querySelectorAll(".sidebar > ul button")].find(
      (node) => node.textContent === "document",
    );
    const bounds = button.getBoundingClientRect();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.x + 20,
      clientY: bounds.y + 10,
    });
    button.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(prevented, true);
}
async function assertRemovalWriteFailure() {
  await browser.execute(() => {
    window.restoreListStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "docreview.document-list.v2")
        throw new DOMException("full", "QuotaExceededError");
      return window.restoreListStorage.call(this, key, value);
    };
  });
  try {
    await $(".forget-document-dialog").$("button=목록에서 완전히 제거").click();
    await $(".forget-document-dialog [role=alert]").waitForDisplayed();
    assert.match(
      await $(".forget-document-dialog [role=alert]").getText(),
      /설정을 저장하지 못했습니다/,
    );
    assert.equal(
      await $(
        '.completed-documents button[aria-label="document 다시 열기"]',
      ).isExisting(),
      true,
    );
  } finally {
    await browser.execute(() => {
      Storage.prototype.setItem = window.restoreListStorage;
      delete window.restoreListStorage;
    });
  }
}
async function saveRemovedDocument() {
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const saved = await editor({
    kind: "read",
    documentId: snapshot.documents.find((doc) => doc.title === "document").id,
  });
  await writeFile(
    join(root, "document-management.json"),
    JSON.stringify(saved),
  );
  assert.equal(
    await readFile(join(root, "document.md"), "utf8"),
    saved.document.content,
  );
}
