import assert from "node:assert/strict";
import { showTaskPanel } from "./generation-fixture.mjs";
import { prepare } from "./review-fixture.mjs";
import { chooseGroup, openReviewOptions, showSummary } from "./review-ui.mjs";

export async function verifyRequestEntryFocus() {
  await prepare("regeneration-late");
  await chooseGroup(1);
  for (const expanded of [false, true]) {
    await browser.setWindowSize(expanded ? 800 : 1440, expanded ? 600 : 900);
    await showTaskPanel();
    await browser.execute((open) => {
      document.querySelector(".task-condition-details").open = open;
      if (open) document.querySelector('[data-testid="task-goal"]').focus();
    }, expanded);
    await showSummary();
    await $("button=이유 묻기").click();
    await $(".request-form .question-target").waitForDisplayed();
    await typeIntoRequest();
    await openReviewOptions();
    await $("button=확정본 전체에서 새 초안 요청").click();
    await $(".request-form textarea").waitForDisplayed();
    await typeIntoRequest();
  }
  await browser.setWindowSize(1440, 900);
}
async function typeIntoRequest() {
  await browser.waitUntil(
    () =>
      browser.execute(() =>
        document.activeElement?.matches(".request-form textarea"),
      ),
    { timeoutMsg: "진입 직후 이번 요청에 실제 포커스가 있어야 합니다." },
  );
  const goal = await $('[data-testid="task-goal"]').getValue();
  await browser.keys("focus-proof");
  assert.match(await $(".request-form textarea").getValue(), /focus-proof/);
  assert.equal(await $('[data-testid="task-goal"]').getValue(), goal);
}
