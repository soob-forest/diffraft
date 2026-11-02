import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ownTestRoot } from "./e2e-preflight.mjs";
import {
  prepareVerificationWorkspace,
  saveVerificationFixture,
} from "./verification-fixture.mjs";

test("copies only owned synthetic data and rebases the document's canonical path", async () => {
  const app = await mkdtemp(join(tmpdir(), "diffraft-fixture-test-")),
    root = await mkdtemp(join(tmpdir(), "docreview-e2e-"));
  let verification;
  try {
    await ownTestRoot(root);
    await mkdir(join(root, "data"));
    const id = "00000000-0000-4000-8000-000000000001",
      path = join(await realpath(root), "source.md");
    await writeFile(path, "합성 원문");
    execFileSync("python3", [
      "-c",
      'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("CREATE TABLE documents(id TEXT,canonical_path TEXT)");c.execute("INSERT INTO documents VALUES(?,?)",sys.argv[2:]);c.commit()',
      join(root, "data/workspace.sqlite3"),
      id,
      path,
    ]);
    await saveVerificationFixture(app, root);
    verification = await prepareVerificationWorkspace(app);
    const stored = execFileSync(
      "python3",
      [
        "-c",
        'import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute("SELECT canonical_path FROM documents").fetchone()[0])',
        join(verification, "data/workspace.sqlite3"),
      ],
      { encoding: "utf8" },
    ).trim();
    assert.equal(stored, join(await realpath(verification), `${id}.md`));
    assert.equal(await readFile(stored, "utf8"), "합성 원문");
  } finally {
    await rm(app, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
    if (verification) await rm(verification, { recursive: true, force: true });
  }
});
