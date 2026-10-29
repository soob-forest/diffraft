import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertNormalExit, observeExit } from "./process-exit.mjs";

test("a disappeared process with SIGSEGV must fail normal-exit validation", () => {
  assert.throws(
    () => assertNormalExit({ pid: 1, code: null, signal: "SIGSEGV" }),
    /SIGSEGV/,
  );
});
test("nonzero and missing exit results must fail", () => {
  assert.throws(
    () => assertNormalExit({ pid: 1, code: 1, signal: null }),
    /정상 종료/,
  );
  assert.throws(() => assertNormalExit(null), /종료 결과/);
});
test("only a zero code without a signal is a normal exit", () => {
  assert.doesNotThrow(() =>
    assertNormalExit({ pid: 1, code: 0, signal: null }),
  );
});
test("the parent records the observed child status, including an already exited child", async () => {
  const root = await mkdtemp(join(tmpdir(), "docreview-exit-test-"));
  try {
    for (const [pid, code, signal] of [
      [1, 0, null],
      [2, null, "SIGSEGV"],
    ]) {
      const child = Object.assign(new EventEmitter(), {
        pid,
        exitCode: null,
        signalCode: null,
      });
      observeExit(child, root);
      child.emit("exit", code, signal);
      assert.deepEqual(
        JSON.parse(await readFile(join(root, `exit-${pid}.json`))),
        { pid, code, signal },
      );
    }
    observeExit({ pid: 3, exitCode: 0, signalCode: null }, root);
    assertNormalExit(JSON.parse(await readFile(join(root, "exit-3.json"))));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
