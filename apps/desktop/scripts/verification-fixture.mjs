import { execFileSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertOwnedRoot } from "./e2e-preflight.mjs";

const backup = `import sqlite3,sys,json
from pathlib import Path
source=sqlite3.connect(Path(sys.argv[1]).as_uri()+"?mode=ro",uri=True)
destination=sqlite3.connect(sys.argv[2])
source.backup(destination)
print(json.dumps(source.execute("SELECT id,canonical_path FROM documents ORDER BY id").fetchall()))
destination.close()
source.close()`;
const rebase = `import sqlite3,sys,json
connection=sqlite3.connect(sys.argv[1])
connection.executemany("UPDATE documents SET canonical_path=? WHERE id=?",json.loads(sys.argv[2]))
connection.commit()
connection.close()`;

export async function saveVerificationFixture(app, root) {
  await assertOwnedRoot(root);
  const destination = join(app, ".artifacts/release-fixture");
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await chmod(destination, 0o700);
  const rows = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        backup,
        join(root, "data/workspace.sqlite3"),
        join(destination, "workspace.sqlite3"),
      ],
      { encoding: "utf8" },
    ),
  );
  const canonicalRoot = await realpath(root);
  for (const [id, path] of rows) {
    if (
      !/^[0-9a-f-]{36}$/i.test(id) ||
      !(await realpath(path)).startsWith(`${canonicalRoot}/`)
    )
      throw new Error("합성 검증 폴더 밖의 문서를 보관할 수 없습니다.");
    await copyFile(path, join(destination, `${id}.md`));
  }
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify({ version: 1, ids: rows.map(([id]) => id) }),
  );
}
export async function prepareVerificationWorkspace(app) {
  const fixture = join(app, ".artifacts/release-fixture"),
    manifest = JSON.parse(
      await readFile(join(fixture, "manifest.json"), "utf8"),
    );
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.ids) ||
    manifest.ids.some(
      (id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id),
    )
  )
    throw new Error("검증 fixture의 문서 목록이 올바르지 않습니다.");
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "diffraft-verify-")),
  );
  await chmod(root, 0o700);
  await writeFile(
    join(root, ".diffraft-verification"),
    "diffraft-verification-v1\n",
    { mode: 0o600, flag: "wx" },
  );
  await mkdir(join(root, "data"));
  const database = join(root, "data/workspace.sqlite3"),
    paths = [];
  await copyFile(join(fixture, "workspace.sqlite3"), database);
  for (const id of manifest.ids) {
    const path = join(root, `${id}.md`);
    await copyFile(join(fixture, `${id}.md`), path);
    paths.push([path, id]);
  }
  execFileSync("python3", ["-c", rebase, database, JSON.stringify(paths)]);
  await chmod(database, 0o600);
  return root;
}
