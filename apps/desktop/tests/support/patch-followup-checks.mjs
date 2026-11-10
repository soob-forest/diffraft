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
import {
  foregroundUnitDisplay,
  settleUnitDisplay,
} from "./unit-review-display.mjs";
import { assertButtonHit } from "./ux-ui.mjs";

export async function checkPolicyUpgrade() {
  const text = "이 기능은 불가능합니다.\n\n상태는 안정합니다.\n";
  const fixture = await openPatchFixture("patch-groups-words", text, [
    ["불가능", "가능"],
    ["안정", "불안정"],
  ]);
  assert.match(fixture.batch.id, /^[a-f0-9-]{36}$/);
  execFileSync("/usr/bin/sqlite3", [
    join(root, "data/workspace.sqlite3"),
    `BEGIN;
    UPDATE patch_reviews SET policy_version=1,revision=7,reasons_json='{}' WHERE batch_id='${fixture.batch.id}';
    UPDATE proposals SET group_id=(SELECT group_id FROM proposals WHERE batch_id='${fixture.batch.id}' LIMIT 1) WHERE batch_id='${fixture.batch.id}'; COMMIT;`,
  ]);
  assert.equal((await projection(fixture)).groups.length, 1);
  await showPatchFixture(fixture.name);
  await waitGroups(2);
  const prepared = await projection(fixture);
  assert.equal(prepared.batch.patchReview.policyVersion, 3);
  assert.equal(prepared.batch.patchReview.revision, 8);
  assert.deepEqual(
    prepared.batch.proposals.map((p) => [p.id, p.revision]),
    fixture.batch.proposals.map((p) => [p.id, p.revision]),
  );
  await chooseGroup(2);
  await $("button=선택한 변경 거절").click();
  await waitGroups(1);
  await $("button=선택한 변경 승인").click();
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === "v2",
  );
  const current = await projection(fixture);
  fixture.batch = current.batch;
  fixture.expected = text.replace("불가능", "가능");
  assert.equal(
    await readFile(join(root, `${fixture.name}.md`), "utf8"),
    fixture.expected,
  );
  return fixture;
}

export async function checkQuotedFences() {
  const text = "> ```text\n> code\n> ```\n\nplain noise\n";
  const fixture = await openPatchFixture("patch-groups-fences", text, [
    ["```text", "~~~text"],
    ["code\n> ```", "code\n> ~~~"],
    ["plain noise", "plain"],
  ]);
  const before = await projection(fixture);
  const closing = fixture.batch.proposals.find(
    (p) => p.operation.before === "code\n> ```",
  );
  assert(closing);
  assert.equal(before.groups.length, 2);
  await rejectPartialGroup(fixture);
  await showPatchFixture(fixture.name);
  await waitGroups(2);
  await showTaskPanel();
  await showSummary();
  await chooseGroup(1);
  const card = $(`[data-proposal-id="${closing.id}"]`);
  await card.waitForDisplayed();
  await card.$("button=직접 후보 수정").click();
  const form = card.$(".proposal-workflow:not([hidden]) .candidate-form");
  await form.$("textarea").setValue("code\n> ~~~invalid");
  await form.$("button=후보 저장").click();
  await browser.waitUntil(async () =>
    (await form.$('[role="status"]').getText()).includes("Markdown 구조"),
  );
  assert.equal(await form.$("textarea").getValue(), "code\n> ~~~invalid");
  assert.deepEqual((await projection(fixture)).batch, before.batch);
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  assert.equal(state.document.version, 1);
  assert.equal(await readFile(join(root, `${fixture.name}.md`), "utf8"), text);
  await checkErrorLayout(closing.id);
}

async function checkErrorLayout(proposalId) {
  const size = await browser.getWindowSize();
  const rootSelector = `[data-proposal-id="${proposalId}"] .proposal-workflow:not([hidden])`;
  try {
    await browser.setWindowSize(800, 600);
    await foregroundUnitDisplay(2);
    const selector = `${rootSelector} .candidate-form [role="status"]`;
    await assertVisibleStatus(selector);
    await browser.saveScreenshot(".artifacts/patch-v2-fence-error-800-2.png");
    await assertButtonHit(`${rootSelector} .workflow-back`);
    await $(`${rootSelector} .workflow-back`).click();
    await $("button=원문").click();
    await showTaskPanel();
    await $(".request-form textarea").waitForDisplayed();
  } finally {
    await foregroundUnitDisplay(1);
    await browser.setWindowSize(size.width, size.height);
  }
}

async function rejectPartialGroup(fixture) {
  const opening = fixture.batch.proposals.find(
    (p) => p.operation.before === "```text",
  );
  assert(opening);
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
            expectedGroupRevision: fixture.batch.patchReview.revision,
            operationId: crypto.randomUUID(),
            proposals: [{ id: opening.id, revision: opening.revision }],
          },
        },
      },
    }),
  );
}

async function assertVisibleStatus(selector) {
  await browser.execute(
    (query) =>
      document
        .querySelector(query)
        .scrollIntoView({ block: "center", behavior: "instant" }),
    selector,
  );
  await settleUnitDisplay();
  const readable = await browser.execute((query) => {
    const node = document.querySelector(query);
    const r = node.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      node.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      )
    );
  }, selector);
  assert.equal(
    readable,
    true,
    "작은 확대 화면에서 오류 전문을 읽을 수 있어야 합니다.",
  );
}
