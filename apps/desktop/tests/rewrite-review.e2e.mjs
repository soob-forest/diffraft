import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkShortUnitLayouts } from "./support/request-workflow-short-layout.mjs";
import {
  confirmed,
  prepareRewrite,
  requestRewrite,
  start,
  waitCandidate,
} from "./support/rewrite-fixture.mjs";
import {
  chooseUnit,
  current,
  editor,
  invoke,
  root,
  showOriginalUnitComparison,
  showUnitComment,
  unitDecision,
} from "./support/unit-review-fixture.mjs";
import { assertGroupedUnitReview } from "./support/unit-review-grouped.mjs";
import {
  checkUnitCommentErrorLayout,
  checkUnitLayout,
} from "./support/unit-review-layout.mjs";
import { measureUnitReviewAfter } from "./support/unit-review-measurement.mjs";
import {
  assertLateOriginalReadKeepsCurrent,
  assertOriginalLoadingFailureRetry,
} from "./support/unit-review-original-read.mjs";
import {
  assertDraftAcrossFilter,
  assertEmptyProcessedFilter,
  assertFilteredSelection,
  assertOriginalTextAfterDecisions,
} from "./support/unit-review-regressions.mjs";

let fixture;
describe("재작성 변경별 검토", registerReviewCases);

function registerReviewCases() {
  afterEach(recordReviewFailure);
  it(
    "실제 생성 뒤 세 변경으로 시작하고 후보 전용 의견을 저장한다",
    createInitialReview,
  );
  it("빈 처리됨 필터는 선택과 단위 행동을 비운다", async () => {
    await assertEmptyProcessedFilter(fixture);
  });
  it(
    "도입부만 승인하고 수치를 거절하며 연속 클릭은 다음 단위를 처리하지 않는다",
    reviewPartialDecisions,
  );
  it("필터 밖 선택을 첫 일치 단위로 옮긴다", async () => {
    await assertFilteredSelection(fixture);
  });
  it("의견 작성 중 필터 이동은 단위를 바꾸고 이전 초안을 보존한다", async () => {
    await assertDraftAcrossFilter(fixture);
  });
  it("부분 결정 뒤 원래 후보의 시각·텍스트 비교에 거절한 20분을 유지한다", async () => {
    await assertOriginalTextAfterDecisions(fixture);
  });
  it("원래 후보 로딩·실패·재시도·성공 캐시는 다른 비교로 대체하지 않는다", async () => {
    await assertOriginalLoadingFailureRetry(fixture);
  });
  it("현재 검토로 복귀한 뒤 늦은 원래 후보 응답은 현재 읽기를 바꾸지 않는다", async () => {
    await assertLateOriginalReadKeepsCurrent(fixture);
  });
  it("긴 제목과 결합 변경의 모든 관련 범위를 같은 번호로 읽고 이동한다", async function () {
    this.timeout(120_000);
    await assertGroupedUnitReview(fixture);
  });
  it(
    "코멘트 저장 실패에도 초안·대상·원문을 보존하고 정상 종료로 재개한다",
    verifyRegistrationFailure,
  );
}

async function recordReviewFailure() {
  if (this.currentTest.state !== "failed") return;
  await mkdir(".artifacts/unit-review/after", { recursive: true });
  await browser.saveScreenshot(".artifacts/unit-review/after/failed.png");
  await writeFile(
    `.artifacts/unit-review/after/focus-failure-${this.currentTest.parent.tests.indexOf(this.currentTest)}.json`,
    JSON.stringify(
      await browser.execute(() => ({
        tag: document.activeElement?.tagName,
        classes: document.activeElement?.className,
      })),
    ),
    "utf8",
  );
}

async function createInitialReview() {
  fixture = await prepareRewrite();
  await requestRewrite();
  await start("REWRITE_UNITS");
  fixture.batch = await waitCandidate(fixture.task.id, 1);
  await $("button=변경별 검토 시작").waitForEnabled();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  const view = await current(fixture);
  assert.equal(view.batch.reviewUnits.length, 3);
  assert.equal(view.batch.mode, "REWRITE");
  assert.equal(await $("button=이 재작성안 적용").isExisting(), false);
  await measureUnitReviewAfter();
  await checkShortUnitLayouts();
  await showUnitComment();
  assert.equal(await $(".unit-comments blockquote").isExisting(), false);
  assert.equal(await $(".unit-comments select").isExisting(), false);
  await $(".unit-comments textarea").setValue("도입부는 이 방향이 좋습니다.");
  await $("button=코멘트 등록").click();
  await browser.waitUntil(
    async () => (await $(".unit-comments textarea").getValue()) === "",
  );
  assert.match(await $(".unit-comments").getText(), /등록된 코멘트 · 1/);
  assert.equal(await readFile(join(root, "rewrite.md"), "utf8"), confirmed);
}

async function reviewPartialDecisions() {
  this.timeout(180_000);
  const approve = await $(".unit-actions").$("button=변경 1 승인");
  await browser
    .action("pointer")
    .move({ origin: approve })
    .down()
    .up()
    .pause(100)
    .down()
    .up()
    .perform();
  await browser.waitUntil(
    async () =>
      (await editor({ kind: "read", documentId: fixture.document.id })).document
        .version === 15,
  );
  await browser.waitUntil(async () =>
    browser.execute(() =>
      document.activeElement?.matches(".unit-review-tools h3"),
    ),
  );
  let view = await current(fixture);
  assert.equal(
    view.batch.proposals.filter((proposal) => proposal.decision === "ACCEPTED")
      .length,
    1,
  );
  await chooseUnit(view.batch.reviewUnits[1].id);
  await unitDecision("거절", fixture, 1, "REJECTED");
  view = await current(fixture);
  assert.doesNotMatch(view.after, /20분/);
  await showOriginalUnitComparison();
  assert.equal(await $(".unit-actions .primary").isExisting(), false);
  await $("button=현재 검토로 돌아가기").click();
  await showUnitComment();
  await $(".unit-comments textarea").setValue("재실행 뒤 이어 쓸 의견");
  await checkUnitLayout(fixture);
}

async function verifyRegistrationFailure() {
  this.timeout(120_000);
  const database = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    database,
    "CREATE TRIGGER deny_unit_comment BEFORE INSERT ON unit_comments BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  ]);
  try {
    await $("button=코멘트 등록").click();
    await browser.waitUntil(async () =>
      (await $(".unit-comments [role=status]").getText()).includes(
        "저장할 수 없습니다",
      ),
    );
    assert.equal(
      await $(".unit-comments textarea").getValue(),
      "재실행 뒤 이어 쓸 의견",
    );
    await checkUnitCommentErrorLayout();
  } finally {
    execFileSync("/usr/bin/sqlite3", [
      database,
      "DROP TRIGGER deny_unit_comment;",
    ]);
  }
  const view = await current(fixture);
  assert.equal(
    view.batch.proposals.filter((proposal) => proposal.decision === "ACCEPTED")
      .length,
    1,
  );
  await saveRestartFixture();
}

async function saveRestartFixture() {
  const selected = await $(".unit-picker select").getValue();
  await writeFile(
    join(root, "unit-expected.json"),
    JSON.stringify({
      ...fixture,
      selected,
      processId: await invoke("e2e_process_id", {}),
    }),
  );
  await browser.waitUntil(async () =>
    (await $(".unit-comments .draft-status").getText()).includes(
      "이 입력의 초안은 기기에 저장됨.",
    ),
  );
}
