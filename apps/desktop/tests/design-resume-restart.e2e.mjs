import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import { openCandidate } from "./support/review-ui.mjs";

describe("SC07 v13 D03 r2 재시작", () => {
  it("다른 프로세스에서 원문 재개 안내와 미승인 후보·코멘트를 복원한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "design-resume.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.processId);
    await $("button=검토 이어가기").waitForDisplayed();
    const state = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(state.document.version, 13);
    await mkdir(".artifacts/design", { recursive: true });
    await browser.saveScreenshot(".artifacts/design/resume-v13.png");
    await $("button=검토 이어가기").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getProperty("textContent")).includes(
        "r2",
      ),
    );
    assert.match(await $(".comment-list").getText(), /실행 주체/);
    assert.equal(await $(".version-badge").getText(), "v13");
    await openCandidate();
    assert.match(await $(".candidate-form textarea").getValue(), /여행자는/);
    await browser.saveScreenshot(".artifacts/design/comment-r2-v13.png");
  });
});
