import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertNormalExit } from "../../scripts/process-exit.mjs";
import { root } from "./review-fixture.mjs";

export async function waitForNormalExit(pid) {
  let result;
  await browser.waitUntil(
    async () => {
      try {
        result = JSON.parse(
          await readFile(join(root, `exit-${pid}.json`), "utf8"),
        );
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    },
    {
      timeout: 12000,
      timeoutMsg: "부모 프로세스가 관측한 앱 종료 결과가 필요합니다.",
    },
  );
  browser.sessionId = undefined;
  assert.equal(result.pid, pid);
  assertNormalExit(result);
}

export async function assertWindowAliveAtExit(pid) {
  const state = JSON.parse(
    await readFile(join(root, "shutdown-lifecycle.json"), "utf8"),
  );
  assert.deepEqual(state, { pid, ready: true, windowAlive: true });
}
