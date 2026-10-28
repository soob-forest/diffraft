import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { prepare } from "./support/review-fixture.mjs";
import {
  candidate,
  choose,
  confirmed,
  decide,
  editor,
  prepareRewrite,
  requestRewrite,
  reviewState,
  root,
  start,
  version,
  waitCandidate,
} from "./support/rewrite-fixture.mjs";

let fixture;
let first;
let second;
const source = '[data-testid="source-editor"]';
const disk = () => readFile(join(root, "rewrite.md"), "utf8");
describe("전체 재작성과 복원", () => {
  it("부분 제안의 기록 이동은 확인 전에는 수행하지 않는다", async () => {
    const partial = await prepare("review");
    await requestRewrite();
    assert.match(
      await $(".rewrite-request-dialog").getText(),
      /부분 제안 묶음을 기록/,
    );
    await $("button=요청 취소").click();
    assert.equal(
      (await reviewState(partial.task.id)).batches[0].status,
      "ACTIVE",
    );
    await requestRewrite();
    await start("REWRITE");
    await waitCandidate(partial.task.id, 2);
    const batches = (await reviewState(partial.task.id)).batches;
    assert.equal(
      batches.find((batch) => batch.id === partial.batch.id).status,
      "ARCHIVED",
    );
    assert.equal(await readFile(join(root, "review.md"), "utf8"), partial.base);
  });
  it("요청 취소는 파일을 유지하고 W02는 +4/-4의 미반영 전체 후보가 된다", async () => {
    fixture = await prepareRewrite();
    await requestRewrite();
    await $("button=요청 취소").click();
    assert.equal((await reviewState(fixture.task.id)).batches.length, 0);
    await requestRewrite();
    await start("REWRITE");
    first = await waitCandidate(fixture.task.id, 1);
    assert.equal(
      await $('[data-testid="comparison-stats"]').getText(),
      "+4 / −4",
    );
    assert.equal(await $("button=선택한 변경 승인").isExisting(), false);
    assert.equal(await $("button=남은 제안 전체 승인").isExisting(), false);
    assert.equal(
      await $('[data-testid="diff-inline"]').getAttribute("contenteditable"),
      "false",
    );
    assert.equal(await disk(), confirmed);
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/rewrite-w02.png");
  });
  it("다른 방향 요청이 실패하면 기존 후보와 입력 지시를 유지한다", async () => {
    await requestRewrite(true);
    await start("malformed");
    await browser.waitUntil(async () =>
      (await $(".rewrite-form > [role=status]").getText()).includes(
        "응답 형식",
      ),
    );
    assert.equal((await reviewState(fixture.task.id)).batches[0].id, first.id);
    assert.equal(
      (await reviewState(fixture.task.id)).batches[0].status,
      "ACTIVE",
    );
    assert.equal(await $(".rewrite-request-dialog").isExisting(), false);
    assert.match(await $(".rewrite-form textarea").getValue(), /상황별/);
    assert.equal(await disk(), confirmed);
  });
  it("생성 중 적용을 막고 이전 안을 명시적으로 다시 선택할 수 있다", async () => {
    await requestRewrite(true);
    await start("REWRITE_DELAY");
    assert.equal(await $("button=이 재작성안 적용").isEnabled(), false);
    second = await waitCandidate(fixture.task.id, 2);
    assert.notEqual(second.id, first.id);
    await choose(first.id);
    await decide("이전 안 선택", "돌아가기");
    assert.equal(
      (await reviewState(fixture.task.id)).batches.find(
        (batch) => batch.id === first.id,
      ).status,
      "ARCHIVED",
    );
    await decide("이전 안 선택", "이 안 선택");
    await browser.waitUntil(
      async () =>
        (await reviewState(fixture.task.id)).batches.find(
          (batch) => batch.id === first.id,
        ).status === "ACTIVE",
    );
    assert.equal(await disk(), confirmed);
  });
  it("후보 취소는 해시를 유지하고 다른 후보의 전체 적용만 v15를 만든다", async () => {
    await decide("제안 취소", "확인 후 제안 취소");
    await browser.waitUntil(
      async () => !(await $("button=이 재작성안 적용").isExisting()),
    );
    assert.equal(await disk(), confirmed);
    assert.equal(await $("button=이 재작성안 적용").isExisting(), false);
    assert.equal(await $("button=이전 안 선택").isExisting(), false);
    await choose(second.id);
    await decide("이전 안 선택", "이 안 선택");
    await decide("이 재작성안 적용", "돌아가기");
    assert.equal(await disk(), confirmed);
    await decide("이 재작성안 적용", "확인 후 전체 적용");
    await version(15);
    assert.equal(await disk(), candidate);
    await $("button=원문").click();
    await $(source).click();
    await browser.keys([Key.Command, "z"]);
    await browser.keys([Key.Command, Key.Shift, "z"]);
    await $("button=저장").click();
    assert.equal(
      (await editor({ kind: "read", documentId: fixture.document.id })).document
        .version,
      15,
    );
    assert.equal(await disk(), candidate);
  });
  it("v15에서 v14 내용을 복원하면 새 v16이 되고 v15도 남는다", async () => {
    await $(".version-history summary").click();
    await $("button=v14 비교·복원").click();
    await $(".restore-dialog").waitForDisplayed();
    assert.equal(
      await $("#restore-title").getText(),
      "현재 v15 → 복원할 v14 내용",
    );
    assert.equal(
      await $('.restore-dialog [data-testid="comparison-stats"]').getText(),
      "+4 / −4",
    );
    await $("button=v14 내용으로 복원").click();
    await version(16);
    assert.equal(await disk(), confirmed);
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(state.versions.length, 16);
    assert.equal(state.versions[0].reason, "restore");
    assert.equal(state.versions[1].reason, "rewrite");
  });
  it("전체 적용 확인 중 외부 파일이 바뀌면 확인을 무효화하고 0건 반영한다", async () => {
    await $("button=변경 검토").click();
    await requestRewrite();
    await start("REWRITE");
    await waitCandidate(fixture.task.id, 3);
    await browser.waitUntil(
      async () => await $("button=이 재작성안 적용").isEnabled(),
    );
    await $("button=이 재작성안 적용").click();
    await $(".batch-decision-dialog").waitForDisplayed();
    await writeFile(join(root, "rewrite.md"), "# 외부 최종 수정\n");
    await browser.waitUntil(
      async () => !(await $(".batch-decision-dialog").isExisting()),
    );
    assert.equal(await disk(), "# 외부 최종 수정\n");
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(state.document.version, 16);
    assert.equal(state.document.content, confirmed);
  });
});
