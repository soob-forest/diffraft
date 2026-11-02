import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const nativeBinary = fileURLToPath(
  new URL("../src-tauri/target/debug/docreview", import.meta.url),
);
export const buildProof = fileURLToPath(
  new URL("../.artifacts/native-build.json", import.meta.url),
);
const ROOT_MARKER = ".docreview-e2e-owned";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const invalidateBuildProof = (proof = buildProof) =>
  rm(proof, { force: true });

export async function recordBuildProof(
  binary = nativeBinary,
  proof = buildProof,
  mode = "normal",
) {
  const sha256 = hash(await readFile(binary));
  await mkdir(dirname(proof), { recursive: true });
  const pending = `${proof}.${process.pid}.tmp`;
  await writeFile(pending, JSON.stringify({ mode, sha256 }));
  await rename(pending, proof);
}

export async function assertE2EBuild(
  binary = nativeBinary,
  proof = buildProof,
) {
  let record;
  try {
    record = JSON.parse(await readFile(proof, "utf8"));
  } catch (reason) {
    if (reason.code !== "ENOENT" && !(reason instanceof SyntaxError))
      throw reason;
    throw new Error(
      "완료된 E2E 빌드 증명이 없습니다. native:build:e2e 완료 후 실행하세요.",
    );
  }
  const bytes = await readFile(binary);
  if (
    record.mode !== "e2e" ||
    record.sha256 !== hash(bytes) ||
    !bytes.includes("e2e_process_id")
  )
    throw new Error(
      "E2E 전용 빌드와 바이너리 해시가 일치하지 않아 실행을 차단했습니다.",
    );
}

export async function ownTestRoot(root) {
  await chmod(root, 0o700);
  const path = await realpath(root);
  await writeFile(
    join(root, ROOT_MARKER),
    JSON.stringify({ version: 1, path }),
    { mode: 0o600, flag: "wx" },
  );
}

export async function assertOwnedRoot(root) {
  const path = await realpath(root),
    temporary = await realpath(tmpdir()),
    info = await lstat(root);
  if (
    dirname(path) !== temporary ||
    !basename(path).startsWith("docreview-e2e-") ||
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o777) !== 0o700 ||
    info.uid !== process.getuid()
  )
    throw new Error("소유한 비공개 E2E 임시 폴더만 사용할 수 있습니다.");
  let marker;
  try {
    marker = JSON.parse(await readFile(join(root, ROOT_MARKER), "utf8"));
  } catch (reason) {
    if (reason.code !== "ENOENT" && !(reason instanceof SyntaxError))
      throw reason;
    throw new Error("E2E 임시 폴더 소유 표시가 없습니다.");
  }
  if (marker.version !== 1 || marker.path !== path)
    throw new Error("E2E 임시 폴더 소유 표시가 일치하지 않습니다.");
}
