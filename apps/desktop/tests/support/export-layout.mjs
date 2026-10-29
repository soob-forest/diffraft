import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { Key } from "webdriverio";
import { openExport } from "./export-fixture.mjs";

export async function inspectExportLayout() {
  const previous = await browser.getWindowSize();
  try {
    await browser.setWindowSize(800, 600);
    await browser.execute(() => {
      document.documentElement.style.zoom = "1.5";
    });
    if (await $("button=작업 패널 접기").isExisting())
      await $("button=작업 패널 접기").click();
    await openExport();
    await assertDialogFits();
    for (let index = 0; index < 10; index++) {
      await browser.keys(Key.Tab);
      assert.equal(
        await browser.execute(() =>
          document
            .querySelector(".export-dialog")
            .contains(document.activeElement),
        ),
        true,
      );
    }
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/export-narrow-150.png");
    await browser.keys(Key.Escape);
    await browser.waitUntil(
      async () => !(await $(".export-dialog[open]").isExisting()),
    );
    assert.equal(
      await browser.execute(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
      "export-open",
    );
  } finally {
    await browser.execute(() => {
      document.documentElement.style.zoom = "1";
    });
    await browser.setWindowSize(previous.width, previous.height);
    if (await $("button=작업·AI 요청 열기").isExisting())
      await $("button=작업·AI 요청 열기").click();
    if (await $("button=변경 상세").isDisplayed())
      await $("button=변경 상세").click();
    if ((await $("button=문서 목록").getAttribute("aria-expanded")) === "false")
      await $("button=문서 목록").click();
  }
}

async function assertDialogFits() {
  const layout = await browser.execute(() => {
    const dialog = document.querySelector(".export-dialog");
    const bounds = dialog.getBoundingClientRect();
    return {
      labelled: document.getElementById(dialog.getAttribute("aria-labelledby"))
        ?.textContent,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
      inside:
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= innerWidth + 1 &&
        bounds.bottom <= innerHeight + 1,
    };
  });
  assert.match(layout.labelled, /확정본 내보내기/);
  assert.equal(layout.horizontalOverflow, false);
  assert.equal(layout.inside, true);
}
