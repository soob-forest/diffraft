import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  final,
  loadPatchState,
  projection,
  waitGroups,
} from "./support/patch-groups-fixture.mjs";
import { editor, root } from "./support/review-fixture.mjs";

describe("PATCH 그룹의 별도 프로세스 재시작", () => {
  it("미처리 그룹 ID와 전환 기록을 보존하고 남은 변경만 전체 승인한다", async () => {
    const main = await loadPatchState();
    const words = await projection(main.words);
    assert.equal(words.batch.patchReview.policyVersion, 3);
    assert.equal(words.batch.patchReview.revision, 8);
    assert.deepEqual(words.batch.proposals, main.words.batch.proposals);
    assert.equal(
      (await editor({ kind: "read", documentId: main.words.document.id }))
        .document.content,
      main.words.expected,
    );
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === main.name,
    );
    await $("button=변경 검토").click();
    await waitGroups(3);
    const current = await projection(main);
    assert.deepEqual(
      current.groups.map((g) => g.id),
      main.ids,
    );
    assert.equal(
      current.batch.patchReview.revision,
      main.batch.patchReview.revision,
    );
    const legacy = await projection(main.legacy);
    assert.equal(legacy.batch.patchReview.revision, 1);
    assert.deepEqual(
      legacy.batch.proposals.map((p) => p.groupId),
      main.legacy.batch.proposals.map((p) => p.groupId),
    );
    await $("button=남은 제안 전체 승인").click();
    await $("dialog[open]").waitForDisplayed();
    assert.match(await $("dialog").getText(), /3개 독립 그룹/);
    await $("button=확인 후 전체 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v3",
    );
    const state = await editor({ kind: "read", documentId: main.document.id });
    assert.equal(state.document.content, final);
    assert.equal(state.versions.length, 3);
    assert.equal(await readFile(join(root, "patch-groups.md"), "utf8"), final);
  });
});
