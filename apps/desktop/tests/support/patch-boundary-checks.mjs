import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { showTaskPanel } from "./generation-fixture.mjs";
import {
  openPatchFixture,
  projection,
  showPatchFixture,
  waitGroups,
} from "./patch-groups-fixture.mjs";
import { editor, invoke, root } from "./review-fixture.mjs";
import { chooseGroup, showSummary } from "./review-ui.mjs";

export async function checkCombinedFenceUpgrade() {
  const text = "aabb\ncontent\nccdd\n\nplain noise\n";
  const fixture = await openPatchFixture("patch-boundary-combined", text, [
    ["aa", "`"],
    ["bb", "``"],
    ["cc", "`"],
    ["dd", "``"],
    ["plain noise", "plain"],
  ]);
  assert.match(fixture.batch.id, /^[a-f0-9-]{36}$/);
  execFileSync("/usr/bin/sqlite3", [
    join(root, "data/workspace.sqlite3"),
    `BEGIN;
    UPDATE patch_reviews SET policy_version=2,revision=7,reasons_json='{}' WHERE batch_id='${fixture.batch.id}';
    UPDATE proposals SET group_id=id WHERE batch_id='${fixture.batch.id}'; COMMIT;`,
  ]);
  assert.equal((await projection(fixture)).groups.length, 5);
  await showPatchFixture(fixture.name);
  await waitGroups(2);
  await chooseGroup(1);
  const prepared = await projection(fixture);
  assert.equal(prepared.batch.patchReview.policyVersion, 3);
  assert.equal(prepared.batch.patchReview.revision, 8);
  await rejectIncompleteFence(fixture, prepared);
  assert.deepEqual((await projection(fixture)).batch, prepared.batch);
  assert.equal(await readFile(join(root, `${fixture.name}.md`), "utf8"), text);
  await $("button=선택한 변경 승인").click();
  await waitGroups(1);
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  assert.equal(state.document.version, 2);
  assert.equal(state.document.content, "```\ncontent\n```\n\nplain noise\n");
  assert.equal(
    await readFile(join(root, `${fixture.name}.md`), "utf8"),
    state.document.content,
  );
  await $("button=선택한 변경 거절").click();
}

export async function checkUnclosedContainerRevision() {
  const text = "> ```\n> code\n\noutside noise\n";
  const fixture = await openPatchFixture("patch-boundary-container", text, [
    ["> ```\n> code", "> ```\n> corrected"],
  ]);
  await showPatchFixture(fixture.name);
  await waitGroups(1);
  await showTaskPanel();
  await showSummary();
  const before = await projection(fixture);
  const card = $(`[data-proposal-id="${fixture.batch.proposals[0].id}"]`);
  await card.waitForDisplayed();
  await card.$("button=직접 후보 수정").click();
  const form = card.$(".proposal-workflow:not([hidden]) .candidate-form");
  await form.$("textarea").setValue("```\n> code");
  await form.$("button=후보 저장").click();
  await browser.waitUntil(async () =>
    (await form.$('[role="status"]').getText()).includes("Markdown 구조"),
  );
  assert.deepEqual((await projection(fixture)).batch, before.batch);
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  assert.equal(state.document.version, 1);
  assert.equal(await readFile(join(root, `${fixture.name}.md`), "utf8"), text);
}

async function rejectIncompleteFence(fixture, prepared) {
  await assert.rejects(() =>
    invoke("review_command", {
      request: {
        schemaVersion: 1,
        action: {
          kind: "accept",
          decision: {
            documentId: fixture.document.id,
            batchId: fixture.batch.id,
            expectedHeadId: fixture.batch.applyHeadId,
            expectedGroupRevision: prepared.batch.patchReview.revision,
            operationId: crypto.randomUUID(),
            proposals: prepared.batch.proposals.slice(0, 2).map((p) => ({
              id: p.id,
              revision: p.revision,
            })),
          },
        },
      },
    }),
  );
}
