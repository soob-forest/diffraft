import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./support/review-fixture.mjs";

describe("지원하지 않는 DB로 시작한 앱", () => {
  it("오류를 안내하고 DB를 변경하지 않으며 정상 종료할 수 있다", async () => {
    await browser.waitUntil(async () =>
      (await $(".error-banner").getText()).includes("더 최신 앱"),
    );
    assert.equal(await $('[data-testid="source-editor"]').isExisting(), false);
    const pid = await invoke("e2e_process_id", {});
    await browser.execute(() => {
      void window.__TAURI__.core.invoke("e2e_request_native_exit");
    });
    await browser.waitUntil(
      () => {
        try {
          process.kill(pid, 0);
          return false;
        } catch (error) {
          if (error.code === "ESRCH") return true;
          throw error;
        }
      },
      { timeout: 3000, timeoutMsg: "초기화 실패 앱도 종료되어야 합니다." },
    );
    browser.sessionId = undefined;
    assert.deepEqual(
      await readFile(join(root, "data/workspace.sqlite3")),
      await readFile(join(root, "expected-database")),
    );
  });
});
