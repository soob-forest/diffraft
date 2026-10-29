import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { root } from "./support/review-fixture.mjs";
import {
  assertSource,
  captureScene,
  openFixture,
  registerReview,
  requestText,
  resizeContent,
  simpleSource,
  travelSource,
} from "./support/tobe-fixture.mjs";
import {
  assertCommentFlow,
  assertConnectionFlow,
  assertNarrowFlow,
  assertRequestFlow,
  assertReviewFlow,
  assertTobeFrame,
} from "./support/tobe-layout.mjs";
import { checkLongComment } from "./support/tobe-long-comment.mjs";

describe("고정 TO-BE의 동일 상태 캡처", () => {
  beforeEach(async () => {
    await resizeContent(1440, 900);
  });
  it("빈 작업 공간의 좁은 창에서도 문서를 열고 만들 수 있다", async () => {
    await resizeContent(800, 600);
    await $("button=문서 목록").waitForDisplayed();
    await $("button=문서 목록").click();
    await $("button=문서 열기").waitForDisplayed();
    await $("button=새 문서").waitForDisplayed();
    await $("button=AI 연결 설정").waitForDisplayed();
    await $("button=문서 목록").click();
  });
  it("요청과 좁은 창에서 동일한 작업·초안을 보존한다", async () => {
    await resizeContent(1440, 900);
    const fixture = await openFixture("document", simpleSource, 2);
    await $(".request-form textarea").setValue(requestText);
    await captureScene("request");
    if (process.env.DOCREVIEW_TOBE_CAPTURE !== "before")
      await assertRequestFlow();
    await resizeContent(800, 600);
    const open = $("button=작업·AI 요청 열기");
    if (await open.isExisting()) await open.click();
    await captureScene("narrow");
    if (process.env.DOCREVIEW_TOBE_CAPTURE !== "before")
      await assertNarrowFlow();
    await resizeContent(1440, 900);
    assert.equal(await $(".request-form textarea").getValue(), requestText);
    await assertSource(fixture, "document");
  });
  it("검토·코멘트·재개를 같은 제안과 승인 전 원문으로 보여준다", async () => {
    const fixture = await openFixture("review", travelSource, 12);
    await registerReview(fixture);
    await captureScene("review");
    if (process.env.DOCREVIEW_TOBE_CAPTURE !== "before")
      await assertReviewFlow();
    await $("button=다음 변경").click();
    const entry = $("button=코멘트 작성");
    if (await entry.isExisting()) await entry.click();
    else await $(".comment-form summary").click();
    await $(".comment-form textarea").setValue(
      "확인 시간은 10분으로 유지해 주세요.",
    );
    await captureScene("comment");
    if (process.env.DOCREVIEW_TOBE_CAPTURE !== "before")
      await assertCommentFlow();
    await $("button=원문").click();
    await captureScene("resume");
    await assertSource(fixture, "review");
  });
  it("가짜 CLI 연결 성공 상태에서 닫기와 진단을 제공한다", async () => {
    await $(".sidebar").$("button=document").click();
    await $("button=AI 연결 설정").click();
    await writeFile(join(root, "next-connection"), "READY");
    await $("button=상태 다시 확인").click();
    await browser.waitUntil(
      async () => await $("button=상태 다시 확인").isEnabled(),
    );
    const diagnostics = $(".connection-diagnostics");
    if ((await diagnostics.getAttribute("open")) === null)
      await diagnostics.$("summary").click();
    await writeFile(join(root, "next-generation"), "EXPLAIN");
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "테스트를 완료",
      ),
    );
    if ((await diagnostics.getAttribute("open")) !== null)
      await diagnostics.$("summary").click();
    await browser.waitUntil(
      async () => !(await $("button[data-operation-id]").isExisting()),
    );
    await captureScene("connection");
    await assertConnectionFlow();
    await $("button=설정 닫기").click();
  });
  if (process.env.DOCREVIEW_TOBE_CAPTURE !== "before")
    it("고정 TO-BE의 공통 프레임과 무테 탐색을 일치시킨다", assertTobeFrame);
  it("긴 표는4줄 인용과 전문·초안·저장 대상을 보존한다", checkLongComment);
});
