import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { Key } from "webdriverio";
import {
  closedOutlineDoesNotParseDuringInput,
  footnoteOutlineUsesOnlySourceHeadings,
} from "./document-navigation-side-effects.mjs";
import { editor } from "./support/review-fixture.mjs";
import {
  openFixture,
  registerReview,
  resizeContent,
  travelSource,
} from "./support/tobe-fixture.mjs";
import "./document-navigation-recovery.mjs";

const artifacts = ".artifacts/document-navigation";
let fixture;
function source() {
  return (
    "\uFEFF# 한글 😀\r\n\r\n## **같은 제목**\r\n\r\n" +
    "긴 문맥입니다.\r\n\r\n".repeat(60) +
    "같은 제목\r\n---------\r\n\r\n마지막 본문\r\n"
  );
}
async function menu() {
  const root = $(".document-navigation");
  if ((await root.getAttribute("open")) === null)
    await root.$("summary").click();
}
async function settle() {
  await browser.execute(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function headingVisible(offset) {
  return browser.execute((offset) => {
    const heading = document.querySelector(
      `.document-main .markdown-preview [data-heading-offset="${offset}"]`,
    );
    if (!heading) return false;
    const bounds = heading.getBoundingClientRect();
    const pane = heading.closest(".editor-panes").getBoundingClientRect();
    return (
      bounds.top >= pane.top &&
      bounds.bottom <= Math.min(pane.bottom, innerHeight)
    );
  }, offset);
}
async function jumpToDuplicate(offset) {
  await menu();
  await $(".document-navigation .outline").waitForDisplayed();
  await $$(".document-navigation .outline button")[2].click();
  await settle();
  assert.equal(await headingVisible(offset), true);
  assert.equal(
    await $(".document-workspace").getAttribute("data-mode"),
    "preview",
  );
}

describe("문서 탐색 이동과 스크롤 회귀", () => {
  before(async () => {
    await mkdir(artifacts, { recursive: true });
    await resizeContent(1440, 900);
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(`${artifacts}/failure.png`);
  });
  it("미리보기에서 같은 제목의 정확한 위치로 반복 이동하고 원문 커서를 유지한다", async () => {
    fixture = await openFixture("review", source(), 1);
    await $('[data-testid="source-editor"]').click();
    await browser.keys([Key.Command, Key.ArrowUp]);
    await browser.keys([Key.Command, Key.ArrowRight]);
    await $("button=미리보기").click();
    await $(".document-main .markdown-preview").waitForDisplayed();
    const offset = source().indexOf("같은 제목\r\n---");
    await jumpToDuplicate(offset);
    await browser.saveScreenshot(`${artifacts}/preview-wide.png`);
    await browser.execute(() => {
      document.querySelector(".editor-panes").scrollTop = 0;
    });
    await jumpToDuplicate(offset);
    await resizeContent(800, 600);
    await jumpToDuplicate(offset);
    await browser.saveScreenshot(`${artifacts}/preview-compact.png`);
    await resizeContent(1440, 900);
    await $("button=원문").click();
    await browser.execute(() =>
      document.querySelector('[data-testid="source-editor"]').focus(),
    );
    await browser.keys(" 커서 유지");
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
    );
    const saved = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(
      saved.document.content,
      source().replace("# 한글 😀", "# 한글 😀 커서 유지"),
    );
  });
  it("대상이 없어지면 다른 제목으로 이동하지 않고 안내한다", async () => {
    await $("button=미리보기").click();
    await menu();
    // Simulate an unavailable rendered target; the remaining duplicate must not be selected.
    await browser.execute(() => {
      document
        .querySelectorAll(".document-main .markdown-preview h2")[1]
        .removeAttribute("data-heading-offset");
    });
    await $$(".document-navigation .outline button")[2].click();
    await $(".preview-navigation-notice").waitForDisplayed();
    assert.match(await $(".preview-navigation-notice").getText(), /제목.*찾/);
    await browser.waitUntil(
      async () =>
        (await $(".document-navigation").getAttribute("open")) === null,
    );
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.activeElement.matches(".preview-navigation-notice"),
      ),
    );
    await browser.saveScreenshot(`${artifacts}/missing-heading.png`);
    assert.equal(
      await $(".document-workspace").getAttribute("data-mode"),
      "preview",
    );
  });
  it("목록 내부 스크롤은 유지하고 바깥 스크롤에는 팝업을 닫는다", async () => {
    await resizeContent(1440, 900);
    await $("button=원문").click();
    fixture = await openFixture("rewrite", travelSource, 1);
    await registerReview(fixture);
    await resizeContent(800, 600);
    await menu();
    await browser.execute(() => {
      document
        .querySelector(".navigation-popover")
        .dispatchEvent(new Event("scroll"));
    });
    assert.notEqual(await $(".document-navigation").getAttribute("open"), null);
    await browser.execute(() => {
      document.querySelector(".document-workspace").scrollTop += 80;
    });
    await settle();
    assert.equal(await $(".document-navigation").getAttribute("open"), null);
    await browser.saveScreenshot(`${artifacts}/outer-scroll-compact.png`);
    await menu();
    await browser.keys(Key.Escape);
    assert.equal(await $(".document-navigation").getAttribute("open"), null);
  });
  it(
    "각주 문서에서도 원문 위치가 있는 제목으로만 이동한다",
    footnoteOutlineUsesOnlySourceHeadings,
  );
  it(
    "목차를 닫으면 긴 문서 입력 중 파싱하지 않고 다시 열 때 최신 내용을 표시한다",
    closedOutlineDoesNotParseDuringInput,
  );
});
