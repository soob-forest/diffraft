import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  current,
  editor,
  reviewState,
  settleUnitLayout,
} from "./unit-review-fixture.mjs";

export async function readUnitInvariant(fixture) {
  await settleUnitLayout();
  const view = await current(fixture);
  const { document } = await editor({
    kind: "read",
    documentId: fixture.document.id,
  });
  const state = await reviewState(fixture.task.id);
  return {
    version: document.version,
    head: document.versionId,
    contentHash: document.contentHash,
    fileHash: createHash("sha256")
      .update(await readFile(document.path))
      .digest("hex"),
    batch: {
      id: view.batch.id,
      status: view.batch.status,
      mode: view.batch.reviewMode,
    },
    proposals: view.batch.proposals.map(
      ({ id, revision, decision, validity }) => ({
        id,
        revision,
        decision,
        validity,
      }),
    ),
    rounds: view.batch.reviewUnits.map(({ id, reviewRevision }) => ({
      id,
      reviewRevision,
    })),
    comments: [...state.comments, ...state.unitComments].map(
      ({ id, revision, status }) => ({ id, revision, status }),
    ),
    generating: state.generating,
  };
}

export async function assertUnitInvariant(fixture, before) {
  assert.deepEqual(
    await readUnitInvariant(fixture),
    before,
    "읽기/키 입력은 원문·결정·회차·등록 의견을 바꾸면 안 됩니다.",
  );
}
