import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Key } from "webdriverio";
import { editor } from "./support/review-fixture.mjs";
import { openFixture, resizeContent } from "./support/tobe-fixture.mjs";

const artifacts = ".artifacts/document-navigation";
const largeDocumentParagraphs = 2925;
const inputSampleCount = 3;
export async function footnoteOutlineUsesOnlySourceHeadings() {
  await resizeContent(1440, 900);
  await $("button=원문").click();
  const content = "# Main\n\nText[^1].\n\n## Actual\n\n[^1]: Footnote text.\n";
  await openFixture("bulk-review", content, 1);
  const source = $('[data-testid="source-editor"]');
  await source.click();
  await browser.keys([Key.Command, Key.ArrowDown]);
  await $(".document-navigation > summary").click();
  const buttons = await $$(".document-navigation .outline button");
  assert.deepEqual(await buttons.map((node) => node.getText()), [
    "Main",
    "Actual",
  ]);
  await buttons[1].click();
  await browser.waitUntil(async () =>
    browser.execute(
      () =>
        getSelection()?.anchorNode?.parentElement?.closest(".cm-line")
          ?.textContent === "## Actual",
    ),
  );
  await $("button=미리보기").click();
  await $(".document-navigation > summary").click();
  await $(".document-navigation .outline").$("button=Actual").click();
  await browser.waitUntil(async () =>
    browser.execute(() => document.activeElement.textContent === "Actual"),
  );
  assert.equal(await $(".preview-navigation-notice").isExisting(), false);
  await browser.saveScreenshot(`${artifacts}/footnote-outline.png`);
}

export async function closedOutlineDoesNotParseDuringInput() {
  await resizeContent(1440, 900);
  await $("button=원문").click();
  const content = `# Heading\n\n${"A synthetic paragraph with **format** and a [link](https://example.com).\n\n".repeat(largeDocumentParagraphs)}`;
  const fixture = await openFixture("performance", content, 1);
  await $('[data-testid="source-editor"]').click();
  await browser.keys([Key.Command, Key.ArrowDown]);
  const samples = await measureInputSamples();
  const phase = process.env.DOCREVIEW_OUTLINE_PHASE || "after";
  assert.ok(["before", "after"].includes(phase));
  await writeFile(
    `${artifacts}/input-${phase}.json`,
    JSON.stringify({ bytes: content.length, samples }, null, 2),
  );
  console.log("closed-outline-input", JSON.stringify({ phase, samples }));
  assert.equal(await $(".document-navigation .outline").isExisting(), false);
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .content,
    `${content}xxx`,
  );
  await $(".document-navigation > summary").click();
  await $(".document-navigation .outline")
    .$("button=Heading")
    .waitForDisplayed();
  await browser.keys(Key.Escape);
  await browser.waitUntil(
    async () => !(await $(".document-navigation .outline").isExisting()),
  );
}

async function measureInputSamples() {
  const samples = [];
  for (let index = 0; index < inputSampleCount; index++) {
    await captureInputTiming();
    await browser.keys("x");
    await browser.waitUntil(async () =>
      browser.execute(() => window.outlineInputMs !== null),
    );
    samples.push(
      await browser.execute(() => Math.round(window.outlineInputMs)),
    );
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
    );
  }
  return samples;
}

async function captureInputTiming() {
  await browser.execute(() => {
    window.outlineInputMs = null;
    document.addEventListener(
      "beforeinput",
      () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.outlineInputMs = performance.now() - start;
          }),
        );
      },
      { capture: true, once: true },
    );
  });
}
