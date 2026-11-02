import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertE2EBuild,
  assertOwnedRoot,
  invalidateBuildProof,
  ownTestRoot,
  recordBuildProof,
} from "./e2e-preflight.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "docreview-e2e-preflight-"));
  const binary = join(root, "binary"),
    proof = join(root, "proof.json");
  try {
    await writeFile(binary, "fixture e2e_process_id");
    await run({ root, binary, proof });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("requires a completed E2E build with the exact binary hash", () =>
  fixture(async ({ binary, proof }) => {
    await assert.rejects(assertE2EBuild(binary, proof), /E2E/);
    await recordBuildProof(binary, proof, "normal");
    await assert.rejects(assertE2EBuild(binary, proof), /E2E/);
    await recordBuildProof(binary, proof, "e2e");
    await assertE2EBuild(binary, proof);
    await writeFile(binary, "changed e2e_process_id");
    await assert.rejects(assertE2EBuild(binary, proof), /E2E/);
    await recordBuildProof(binary, proof, "e2e");
    await invalidateBuildProof(proof);
    await assert.rejects(assertE2EBuild(binary, proof), /E2E/);
  }));
test("rejects a binary without the E2E command even with a matching hash", () =>
  fixture(async ({ binary, proof }) => {
    await writeFile(binary, "ordinary application");
    await recordBuildProof(binary, proof, "e2e");
    await assert.rejects(assertE2EBuild(binary, proof), /E2E/);
  }));
test("requires an owned private temporary root before launching", () =>
  fixture(async ({ root }) => {
    await assert.rejects(assertOwnedRoot(root), /임시/);
    await ownTestRoot(root);
    await assertOwnedRoot(root);
    await assert.rejects(assertOwnedRoot(tmpdir()), /임시/);
    await assert.rejects(assertOwnedRoot(process.cwd()), /임시/);
  }));
