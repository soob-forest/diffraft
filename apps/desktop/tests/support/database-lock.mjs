import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { root } from "./review-fixture.mjs";

// Hold a real SQLite write transaction; IPC and application storage stay intact.
export async function holdDatabase() {
  const child = spawn(
    "/usr/bin/sqlite3",
    [join(root, "data/workspace.sqlite3")],
    {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    },
  );
  const output = once(child.stdout, "data");
  child.stdin.write("BEGIN IMMEDIATE;\n.print locked\n");
  const [ready] = await output;
  assert.equal(ready.toString().trim(), "locked");
  return async () => {
    const exited = once(child, "exit");
    child.stdin.end("ROLLBACK;\n");
    const [code] = await exited;
    assert.equal(code, 0);
  };
}
