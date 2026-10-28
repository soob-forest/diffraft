import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./support/review-fixture.mjs";

describe("미완료 승인 복구 뒤 작업 계속", () => {
  it("새 프로세스가 승인 한 건을 정확히 복구하고 다음 변경도 승인한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "recovery-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.processId);
    await $('[data-testid="source-editor"]').waitForDisplayed();
    const state = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(state.document.status, "READY");
    assert.equal(state.document.version, 13);
    assert.equal(state.document.content, expected.content);
    assert.equal(state.versions.length, 13);
    await verifyDecisions(expected.batchId, state.document.versionId);
    await $("button=변경 검토").click();
    await browser.waitUntil(
      async () => await $("button=선택한 변경 승인").isEnabled(),
    );
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v14",
    );
    const saved = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(saved.versions.length, 14);
    assert.equal(
      await readFile(join(root, "review.md"), "utf8"),
      saved.document.content,
    );
  });
});

async function verifyDecisions(batchId, expectedHeadId) {
  const projection = await invoke("review_command", {
    request: {
      schemaVersion: 1,
      action: { kind: "projection", batchId, expectedHeadId },
    },
  });
  const proposals = projection.value.batch.proposals;
  assert.equal(
    proposals.filter((item) => item.decision === "ACCEPTED").length,
    1,
  );
  assert.equal(
    proposals.filter(
      (item) => item.decision === "PENDING" && item.validity === "VALID",
    ).length,
    2,
  );
}
