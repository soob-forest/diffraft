import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { settleUxRender } from "./ux-render.mjs";
import { focusMatches } from "./ux-ui.mjs";

const SCROLL_STEP_PX = 24;

export async function assertScrollClosesSelection(selector) {
  const movement = await browser.execute(
    (query, step) => {
      const scroller = document.querySelector(query)?.closest(".cm-scroller");
      if (!scroller) throw new Error("비교 스크롤 영역을 찾을 수 없습니다.");
      const before = scroller.scrollTop;
      const maximum = scroller.scrollHeight - scroller.clientHeight;
      const next = before + step <= maximum ? before + step : before - step;
      if (next < 0)
        throw new Error(
          `실제 ${step}px 스크롤할 공간이 필요합니다: ${JSON.stringify({ before, maximum })}`,
        );
      scroller.scrollTop = next;
      return { before, after: scroller.scrollTop, maximum };
    },
    selector,
    SCROLL_STEP_PX,
  );
  await writeFile(
    ".artifacts/ux/keyboard-selection-scroll.json",
    JSON.stringify(movement, null, 2),
  );
  assert.ok(
    Math.abs(Math.abs(movement.after - movement.before) - SCROLL_STEP_PX) < 1,
    `비교 영역이 실제로 이동해야 합니다: ${JSON.stringify(movement)}`,
  );
  await browser.waitUntil(
    async () =>
      !(await $(".selection-context").isExisting()) &&
      (await focusMatches(selector)),
    {
      timeoutMsg: "비교 스크롤 후 선택 도구가 닫히고 편집기로 복귀해야 합니다.",
    },
  );
  await settleUxRender();
  assert.equal(await $(".selection-context").isExisting(), false);
  assert.equal(await focusMatches(selector), true);
}
