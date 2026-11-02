import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.DOCREVIEW_E2E_DATA;
describe("로컬 초안 재시작 복원", () => {
  it("저장된 요청을 재실행 후 복원하며 자동으로 실행하지 않는다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "ux-expected.json"), "utf8"),
    );
    await $(".request-form textarea").waitForDisplayed();
    assert.equal(
      await $(".request-form textarea").getValue(),
      "앱 재실행 후 복원할 요청",
    );
    assert.equal(await $(".generation-dialog").isExisting(), false);
    const page = await browser.execute(
      async (taskId) =>
        window.__TAURI__.core.invoke("task_conversation", {
          request: { schemaVersion: 1 },
          taskId,
          before: null,
        }),
      expected.taskId,
    );
    assert.equal(page.lastAttempt.status, "SUCCEEDED");
    assert.equal(await $(".version-badge").getText(), "v12");
  });
});
