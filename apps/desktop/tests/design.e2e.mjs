import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup, openComment } from "./support/review-ui.mjs";

let fixture;
describe("시안 이행 회귀", () => {
  it("검토 상세는 오른쪽, 변경 목록은 왼쪽, diff는 남은 높이를 사용한다", async () => {
    fixture = await prepare("review");
    await mkdir(".artifacts/design", { recursive: true });
    assert.equal(await $(".review-resume").isExisting(), false);
    await browser.execute(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await browser.saveScreenshot(".artifacts/design/review.png");
    const layout = await browser.execute(() => {
      const pane = document.querySelector(".diff-panes");
      const detail = document.querySelector(".proposal-details");
      const sidebar = document.querySelector(".sidebar");
      const bounds = pane.getBoundingClientRect();
      return {
        right: detail.getBoundingClientRect().left >= bounds.right,
        navigation: Boolean(sidebar.querySelector('[aria-label="변경 그룹"]')),
        font: getComputedStyle(pane.querySelector(".cm-scroller")).fontSize,
        toolsHeight: document
          .querySelector(".review-tools")
          .getBoundingClientRect().height,
        height: bounds.height,
        available:
          document.querySelector(".document-main").getBoundingClientRect()
            .bottom - bounds.top,
      };
    });
    assert.equal(
      layout.right,
      true,
      "코멘트/상세는 diff 아래가 아니라 오른쪽이어야 한다",
    );
    assert.equal(layout.navigation, true);
    assert.equal(layout.font, "16px");
    assert.ok(
      (await $$(".change-group-start")).length >= 3,
      "본문에 각 변경 그룹 제목이 보여야 합니다",
    );
    assert.ok(layout.available - layout.height < 90, JSON.stringify(layout));
    assert.ok(Math.abs(layout.toolsHeight - 202) <= 2, JSON.stringify(layout));
    await assertSecondaryContrast();
  });
  it("나란히 보기의 실제 열 폭에 맞춰 읽기 안내를 표시한다", async () => {
    await $("button=나란히").click();
    const widths = await browser.execute(() =>
      [...document.querySelectorAll(".diff-pane")].map(
        (pane) => pane.clientWidth,
      ),
    );
    assert.equal(widths.length, 2);
    assert.equal(
      await $(".split-guidance").isExisting(),
      widths.some((width) => width < 540),
    );
    await browser.saveScreenshot(".artifacts/design/split.png");
    await $("button=인라인").click();
  });
  it("모드를 왕복해도 선택 그룹과 비교 보기를 유지한다", async () => {
    await chooseGroup(2);
    await $("button=나란히").click();
    for (let round = 0; round < 3; round++) {
      await $("button=원문").click();
      assert.ok((await $$(".review-resume")).length <= 1);
      await $("button=변경 검토").click();
      assert.equal((await $$(".review-resume")).length, 0);
    }
    assert.match(await $(".selected-group h3").getText(), /선택 2 \/ 3/);
    assert.equal(await $("button=나란히").getAttribute("aria-pressed"), "true");
    await chooseGroup(1);
    await $("button=인라인").click();
  });
  it("조건 요약은 요청 위, 작업 선택은 오른쪽에 있고 왕복 초안을 유지한다", async () => {
    await $("button=원문").click();
    await $(".request-form textarea").setValue("시안 이행 요청 초안");
    const order = await browser.execute(() => ({
      conditions: document
        .querySelector(".task-condition-details")
        .getBoundingClientRect().top,
      request: document
        .querySelector(".generation-panel form")
        .getBoundingClientRect().top,
      task: Boolean(document.querySelector(".task-panel .task-picker")),
    }));
    assert.ok(order.conditions < order.request);
    assert.equal(order.task, true);
    await browser.saveScreenshot(".artifacts/design/request.png");
    await $("button=변경 검토").click();
    await openComment();
    await $(".comment-form textarea").setValue("수치는 유지해 주세요.");
    await browser.saveScreenshot(".artifacts/design/comment.png");
    await $("button=원문").click();
    assert.equal(
      await $(".request-form textarea").getValue(),
      "시안 이행 요청 초안",
    );
    assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
  });
  it("1600 기준 영역 치수와 실제 본문 선택을 검증한다", async () => {
    await browser.execute(() =>
      window.__TAURI__.window
        .getCurrentWindow()
        .setSize(new window.__TAURI__.dpi.LogicalSize(1600, 1000)),
    );
    await $("button=변경 검토").click();
    const inserted = await $$(".diff-insert");
    await inserted[1].click();
    await browser.waitUntil(async () =>
      (await $(".selected-group h3").getText()).includes("선택 2 / 3"),
    );
    const geometry = await browser.execute(() => {
      const size = (selector) => {
        const bounds = document.querySelector(selector).getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      };
      return {
        viewport: [innerWidth, innerHeight],
        header: size(".app-header"),
        sidebar: size(".sidebar"),
        toolbar: size(".document-toolbar"),
        modes: size(".document-modebar"),
        detail: size(".workspace-panel"),
        footer: size("footer"),
        radius: getComputedStyle(document.querySelector(".view-toggle button"))
          .borderRadius,
      };
    });
    assert.equal(geometry.header.height, 50);
    assert.equal(geometry.sidebar.width, 196);
    assert.equal(geometry.toolbar.height, 77);
    assert.equal(geometry.modes.height, 48);
    assert.equal(geometry.detail.width, 360);
    assert.equal(geometry.footer.height, 32);
    assert.equal(geometry.radius, "0px");
    await writeFile(
      ".artifacts/design/geometry.json",
      JSON.stringify(geometry, null, 2),
    );
    await browser.saveScreenshot(".artifacts/design/review-1600.png");
  });
});

async function assertSecondaryContrast() {
  const colors = await browser.execute(() =>
    [".sidebar h2", ".task-panel .task-picker", "footer"].map((selector) => {
      const element = document.querySelector(selector);
      let parent = element;
      let background;
      do {
        background = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      } while (background === "rgba(0, 0, 0, 0)" && parent);
      return {
        selector,
        foreground: getComputedStyle(element).color,
        background,
      };
    }),
  );
  const luminance = (color) => {
    const values = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((value) => Number(value) / 255);
    const linear = values.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const sample of colors) {
    const values = [luminance(sample.foreground), luminance(sample.background)];
    sample.ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    assert.ok(sample.ratio >= 4.5, JSON.stringify(sample));
  }
  await writeFile(
    ".artifacts/design/contrast.json",
    JSON.stringify(colors, null, 2),
  );
}
