import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { layoutSource } from "../tests/fixtures/layout.mjs";
import { ownTestRoot } from "./e2e-preflight.mjs";

export async function prepareStartupFailure(root, phase) {
  if (phase !== "startup-failure") return;
  await mkdir(join(root, "data"));
  const path = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    path,
    "PRAGMA user_version=999; CREATE TABLE preserve(value TEXT); INSERT INTO preserve VALUES('fixture');",
  ]);
  await writeFile(join(root, "expected-database"), await readFile(path));
}

export async function prepare(root) {
  await ownTestRoot(root);
  await writeFile(join(root, "layout.md"), layoutSource);
  await preparePerformance(root);
  await prepareDocuments(root);
  await prepareLarge(root);
}

async function preparePerformance(root) {
  const performanceBytes = 50 * 1024;
  const paragraph = `${"성능 검사를 위한 원문 문단입니다. ".repeat(8)}\n\n`;
  const performanceSource = `# 성능 문서\n\n${paragraph.repeat(Math.floor((performanceBytes - 100) / Buffer.byteLength(paragraph)))}`;
  await writeFile(
    join(root, "performance.md"),
    performanceSource +
      " ".repeat(performanceBytes - Buffer.byteLength(performanceSource)),
  );
}

async function prepareDocuments(root) {
  const base = await readFile(
    new URL("../../../docs/examples/base_v12.md", import.meta.url),
    "utf8",
  );
  await writeFile(join(root, "review.md"), base);
  await writeFile(
    join(root, "rewrite.md"),
    await readFile(
      new URL("../../../docs/examples/confirmed_v14.md", import.meta.url),
      "utf8",
    ),
  );
  await writeFile(join(root, "bulk-review.md"), base);
  await writeFile(join(root, "regeneration.md"), base);
  await writeFile(join(root, "regeneration-late.md"), base);
  await writeFile(join(root, "conflict-review.md"), base);
  await writeFile(
    join(root, "document.md"),
    "\ufeff# 로컬 문서\r\n\r\n한글 😀 원문\r\n",
  );
  await writeFile(join(root, "readonly.md"), "# 읽기 전용\n원문 유지\n");
  await chmod(join(root, "readonly.md"), 0o444);
}

async function prepareLarge(root) {
  const limit = 1024 * 1024;
  const unit = "한글과 emoji 😀 · 문단 검증\n\n";
  const content = `# 큰 문서\n${unit.repeat(Math.floor((limit - 100) / Buffer.byteLength(unit)))}`;
  await writeFile(
    join(root, "large.md"),
    `${content}${" ".repeat(limit - Buffer.byteLength(content))}`,
  );
}
