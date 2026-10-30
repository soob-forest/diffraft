import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const fixture = fileURLToPath(
  new URL("./fixtures/fake-claude.mjs", import.meta.url),
);
it("fake child rejects missing values, invalid models, and duplicates", () => {
  for (const args of [
    ["--model"],
    ["--model", "invalid"],
    ["--model", "opus", "--model", "sonnet"],
  ]) {
    const child = spawnSync(process.execPath, [fixture, "EXPLAIN", ...args], {
      input: JSON.stringify({ schemaVersion: 1 }),
      encoding: "utf8",
      timeout: 5000,
    });
    expect(child.status).not.toBe(0);
  }
});

it("fake child fails when the real launcher omits or changes an expected model", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-contract-"));
  try {
    writeFileSync(join(directory, "expected-model"), "sonnet");
    for (const args of [[], ["--model", "opus"]]) {
      const child = spawnSync(process.execPath, [fixture, "EXPLAIN", ...args], {
        cwd: directory,
        input: JSON.stringify({ schemaVersion: 1 }),
        timeout: 5000,
      });
      expect(child.status).toBe(2);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
