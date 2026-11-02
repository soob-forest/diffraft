import assert from "node:assert/strict";
import { Key } from "webdriverio";

export async function selectSource(text, keyboardActions = false) {
  const lines = await $$(".source-editor .cm-line");
  let line;
  let row = 0;
  for (const candidate of lines) {
    if ((await candidate.getText()).includes(text)) {
      line = candidate;
      break;
    }
    row += 1;
  }
  assert.ok(line, "원문 행이 있어야 합니다.");
  await line.click();
  await browser.execute(() =>
    document.querySelector('[data-testid="source-editor"]').focus(),
  );
  await browser.keys([Key.Command, Key.ArrowUp]);
  for (let index = 0; index < row; index++) await browser.keys(Key.ArrowDown);
  await browser.keys([Key.Command, Key.ArrowLeft]);
  await browser.keys([
    Key.Shift,
    Key.ArrowRight,
    Key.ArrowRight,
    Key.ArrowRight,
    Key.ArrowRight,
  ]);
  if (keyboardActions) {
    await browser.execute(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await browser.keys([Key.Shift, Key.F10]);
  }
  await $(".document-main > .selection-context").waitForDisplayed();
  await $(".document-main > .selection-context")
    .$("button=이 부분 수정")
    .waitForDisplayed();
}
