import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkCombinedFenceUpgrade,
  checkUnclosedContainerRevision,
} from "./support/patch-boundary-checks.mjs";
import {
  checkPolicyUpgrade,
  checkQuotedFences,
} from "./support/patch-followup-checks.mjs";
import {
  checkPatchLayout,
  makeLegacyFixture,
  openPatchFixture,
  partial,
  projection,
  savePatchState,
  showPatchFixture,
  source,
  waitGroups,
} from "./support/patch-groups-fixture.mjs";
import { editor, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";

let main;
describe("PATCH 독립 변경 검토", () => {
  it("같은 요청의 다섯 변경을 탐색하고 하나 거절·하나 승인한다", async () => {
    main = await openPatchFixture("patch-groups");
    assert.equal(new Set(main.batch.proposals.map((p) => p.groupId)).size, 5);
    await showPatchFixture(main.name);
    await waitGroups(5);
    assert.match(await $(".selected-group h3").getText(), /1 \/ 5/);
    await checkPatchLayout();
    for (const number of [2, 3, 4, 5, 1]) {
      await $("button=다음 변경").click();
      assert.match(
        await $(".selected-group h3").getText(),
        new RegExp(`${number} / 5`),
      );
    }
    await $("button=이전 변경").click();
    assert.match(await $(".selected-group h3").getText(), /5 \/ 5/);
    await $("button=다음 변경").click();
    await $("button=다음 변경").click();
    assert.match(await $(".selected-group h3").getText(), /2 \/ 5/);
    await $("button=선택한 변경 거절").click();
    await waitGroups(4);
    assert.equal(await readFile(join(root, "patch-groups.md"), "utf8"), source);
    await chooseGroup(1);
    await $("button=선택한 변경 승인").click();
    await waitGroups(3);
    assert.equal(
      await readFile(join(root, "patch-groups.md"), "utf8"),
      partial,
    );
    const current = await projection(main);
    assert.equal(current.groups.length, 3);
    main.batch = current.batch;
    main.ids = current.groups.map((g) => g.id);
    await savePatchState(main);
  });

  it("기존 미처리 한 그룹을 AI 재요청 없이 네 그룹으로 전환하고 외부 충돌을 차단한다", async () => {
    const legacy = await openPatchFixture(
      "patch-groups-legacy",
      source.slice(0, source.indexOf("다섯")),
    );
    makeLegacyFixture(legacy.batch);
    await showPatchFixture(legacy.name);
    await waitGroups(4);
    const current = await projection(legacy);
    assert.equal(current.groups.length, 4);
    assert.equal(current.batch.patchReview.revision, 1);
    assert.deepEqual(
      current.batch.proposals.map((p) => [p.id, p.revision]),
      legacy.batch.proposals.map((p) => [p.id, p.revision]),
    );
    assert.equal(
      await readFile(join(root, "patch-groups-legacy.md"), "utf8"),
      legacy.text,
    );
    main.legacy = {
      ...legacy,
      batch: current.batch,
      ids: current.groups.map((g) => g.id),
    };
    await $("button=남은 제안 전체 승인").click();
    await $("dialog[open]").waitForDisplayed();
    await writeFile(join(root, "patch-groups-legacy.md"), "# 외부 변경 보존\n");
    await browser.waitUntil(
      async () => !(await $("dialog[open]").isExisting()),
    );
    const state = await editor({
      kind: "read",
      documentId: legacy.document.id,
    });
    assert.equal(state.document.content, legacy.text);
    assert.equal(state.document.version, 1);
    await showPatchFixture(main.name);
    await waitGroups(3);
    await savePatchState(main);
  });
  it("v1의 단어 교정 결합을 v3으로 전환해 각각 결정한다", async () => {
    main.words = await checkPolicyUpgrade();
    await showPatchFixture(main.name);
    await savePatchState(main);
  });
  it("인용문 코드블록의 정상 짝을 허용하고 잘못된 후보 저장을 보존한다", async () => {
    await checkQuotedFences();
    await showPatchFixture(main.name);
  });
  it("v2의 복합 fence 변경을 결합하고 부분 승인을 차단한 뒤 함께 저장한다", async () => {
    await checkCombinedFenceUpgrade();
    await showPatchFixture(main.name);
  });
  it("미완성 코드블록의 인용문 경계를 제거하는 후보 수정을 거부한다", async () => {
    await checkUnclosedContainerRevision();
    await showPatchFixture(main.name);
  });
});
