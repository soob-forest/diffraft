import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { Key } from "webdriverio";
import { holdDatabase } from "./support/database-lock.mjs";
import { openFixture, resizeContent } from "./support/tobe-fixture.mjs";

it("저장이 중단돼도 현재 편집본의 목차로 정확히 이동한다", async () => {
  await mkdir(".artifacts/document-navigation", { recursive: true });
  await resizeContent(1440, 900);
  const original =
    "# Saved A\n\n" +
    "Synthetic paragraph.\n\n".repeat(45) +
    "# Saved B\n\nEnd\n";
  await openFixture("document", original, 1);
  const release = await holdDatabase();
  try {
    const source = $('[data-testid="source-editor"]');
    await source.click();
    await browser.keys([Key.Command, "a"]);
    await source.addValue(original.replaceAll("Saved", "Wrong"));
    await browser.waitUntil(async () =>
      (await $('[data-testid="save-status"]').getText()).includes("중지"),
    );
    await $("button=미리보기").click();
    await $(".document-main .markdown-preview").waitForDisplayed();
    await $(".document-navigation > summary").click();
    const headings = await $$(".document-navigation .outline button");
    assert.deepEqual(await headings.map((node) => node.getText()), [
      "Wrong A",
      "Wrong B",
    ]);
    await browser.saveScreenshot(
      ".artifacts/document-navigation/live-outline.png",
    );
    await headings[1].click();
    await browser.waitUntil(async () =>
      browser.execute(() => document.activeElement.textContent === "Wrong B"),
    );
    assert.equal(await $(".preview-navigation-notice").isExisting(), false);
    await browser.saveScreenshot(
      ".artifacts/document-navigation/unsaved-outline.png",
    );
    await assertSourceJump();
  } finally {
    await release();
    await $("button=원문").click();
    await $("button=저장 다시 시도").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
    );
  }
});

async function assertSourceJump() {
  await $("button=원문").click();
  await $(".document-navigation > summary").click();
  await $(".document-navigation .outline").$("button=Wrong B").click();
  await browser.waitUntil(async () =>
    browser.execute(() => {
      const selection = getSelection();
      return (
        selection?.anchorNode?.parentElement?.closest(".cm-line")
          ?.textContent === "# Wrong B"
      );
    }),
  );
}
