import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { checkFoldedNavigation } from "./support/folded-navigation.mjs";
import { editor, examples, prepare, root } from "./support/review-fixture.mjs";
import {
  chooseGroup,
  openCandidate,
  openComment,
  showSummary,
} from "./support/review-ui.mjs";

const revised = "여행자는 준비물과 다음 여행 계획을 여행 기록에 남깁니다.";
let reviewDocument;
async function readyVersion(version) {
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === `v${version}`,
  );
  await browser.waitUntil(
    async () =>
      (await $("button=선택한 변경 승인").isExisting()) &&
      (await $("button=선택한 변경 승인").isEnabled()),
  );
}
describe("네이티브 변경 검토", () => {
  it(
    "접힌 긴 표의 추가 행으로 F7/Shift+F7 이동하며 원문을 보존한다",
    checkFoldedNavigation,
  );
  it("B01의 정확한 통계·읽기 전용 비교와 보기 전환을 제공한다", async () => {
    reviewDocument = await prepare("review");
    assert.equal(await $('[data-testid="diff-stats"]').getText(), "+3 / −3");
    assert.equal(
      await $('[data-testid="diff-inline"]').getAttribute("contenteditable"),
      "false",
    );
    await $("button=나란히").click();
    await $('[data-testid="diff-before"]').waitForDisplayed();
    assert.equal(
      await $('[data-testid="diff-after"]').getAttribute("contenteditable"),
      "false",
    );
    assert.match(await $('[data-testid="diff-before"]').getText(), /10분/);
    const expressions = await browser.execute(() =>
      [...document.querySelectorAll(".diff-expression")].map(
        (element) => element.textContent,
      ),
    );
    assert.ok(expressions.includes("10") && expressions.includes("5"));
    await $("button=인라인").click();
    await browser.waitUntil(
      async () =>
        browser.execute(() => {
          const lines = [
            ...document.querySelectorAll(".diff-pane .cm-content .cm-line"),
          ];
          const numbers = [
            ...document.querySelectorAll(".diff-numbers .cm-gutterElement"),
          ];
          return (
            lines.length > 4 &&
            Math.abs(
              lines[3].getBoundingClientRect().top -
                numbers[3].getBoundingClientRect().top,
            ) < 2
          );
        }),
      { timeoutMsg: "원문 행과 gutter 행 번호가 정렬되어야 합니다." },
    );
    await assertInitialApprovalLayout();
    assert.match(await $("button=다음 변경").getAttribute("title"), /F7/);
    assert.equal(
      await readFile(join(root, "review.md"), "utf8"),
      reviewDocument.base,
    );
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/review-inline.png");
  });
  it("D02 거절·D01 승인 후 새 head에서 나머지 변경을 유지한다", async () => {
    await chooseGroup(2);
    await $("button=선택한 변경 거절").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="diff-stats"]').getText()) === "+2 / −2",
    );
    assert.equal(
      await readFile(join(root, "review.md"), "utf8"),
      reviewDocument.base,
    );
    await chooseGroup(1);
    await $("button=선택한 변경 승인").click();
    await readyVersion(13);
    const disk = await readFile(join(root, "review.md"), "utf8");
    assert.match(disk, /동행인에게 바로/);
    assert.match(disk, /10분/);
    assert.equal(await $('[data-testid="diff-stats"]').getText(), "+1 / −1");
  });
  it("코멘트 대상과 후보 r2를 저장하고 v14를 정확히 승인한다", async () => {
    await openComment();
    await $(".comment-side").$("button=제안 내용").click();
    await browser.waitUntil(async () =>
      (await $(".comment-form blockquote").getText()).includes(
        "준비 확인이 필요한 여행",
      ),
    );
    await $(".comment-form textarea").setValue("책임 주체를 명시해 주세요.");
    await $("button=코멘트 저장").click();
    await browser.waitUntil(async () =>
      (await $(".comment-list").getText()).includes("책임 주체"),
    );
    await openCandidate();
    await $(".candidate-form textarea").setValue(revised);
    await $("button=후보 저장").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getProperty("textContent")).includes(
        "r2",
      ),
    );
    assert.match(await $(".comment-list").getText(), /연결 위치 확인 필요/);
    await showSummary();
    await browser.waitUntil(
      async () => await $("button=선택한 변경 승인").isEnabled(),
    );
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v14",
    );
    assert.equal(
      await readFile(join(root, "review.md"), "utf8"),
      await readFile(new URL("confirmed_v14.md", examples), "utf8"),
    );
    await browser.waitUntil(async () =>
      browser.execute(
        () => document.activeElement?.getAttribute("role") === "status",
      ),
    );
    await browser.saveScreenshot(".artifacts/review-completed.png");
    assert.match(
      await $(".group-bar [role=status]").getText(),
      /변경 상세의 처리·이전 기록/,
    );
    await $("button=원문").click();
    await $('[data-testid="source-editor"]').click();
    await browser.keys([Key.Command, "z"]);
    const source = await browser.execute(() =>
      [...document.querySelectorAll('[data-testid="source-editor"] .cm-line')]
        .map((line) => line.textContent)
        .join("\n"),
    );
    assert.equal(
      source,
      await readFile(new URL("confirmed_v14.md", examples), "utf8"),
    );
    assert.equal(await $(".version-badge").getText(), "v14");
  });
  it("전체 승인 확인 중 외부 변경이 있으면 확인창을 닫고 0건 반영한다", async () => {
    const fixture = await prepare("conflict-review");
    await $("button=남은 제안 전체 승인").click();
    await $("dialog[open]").waitForDisplayed();
    await writeFile(join(root, "conflict-review.md"), "# 외부 변경 보존\n");
    await browser.waitUntil(
      async () => !(await $("dialog[open]").isExisting()),
    );
    assert.equal(
      await readFile(join(root, "conflict-review.md"), "utf8"),
      "# 외부 변경 보존\n",
    );
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(state.document.version, 12);
    assert.equal(state.document.content, fixture.base);
  });
  it("거절한 D02를 제외한 두 제안을 확인하고 한 버전으로 전체 승인한다", async () => {
    const fixture = await prepare("bulk-review");
    await chooseGroup(2);
    await $("button=선택한 변경 거절").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="diff-stats"]').getText()) === "+2 / −2",
    );
    await browser.waitUntil(
      async () => await $("button=남은 제안 전체 승인").isEnabled(),
    );
    await $("button=남은 제안 전체 승인").click();
    await $("dialog[open]").waitForDisplayed();
    const included = await $("dialog ul").getText();
    assert.match(included, /출발 알림 조건/);
    assert.match(included, /여행 기록 기준/);
    assert.doesNotMatch(included, /확인 시간/);
    assert.match(await $("dialog").getText(), /제안 1개는 제외/);
    await browser.saveScreenshot(".artifacts/bulk-two.png");
    await $("button=확인 후 전체 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v13",
    );
    const expected = (
      await readFile(new URL("proposal_B01.md", examples), "utf8")
    ).replace("5분", "10분");
    assert.equal(
      await readFile(join(root, "bulk-review.md"), "utf8"),
      expected,
    );
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(state.versions.length, 13);
  });
});

async function assertInitialApprovalLayout() {
  const layout = await browser.execute(() => {
    document.querySelector(".review-panel").scrollTop = 0;
    return {
      actionsBottom: document
        .querySelector(".selected-group .proposal-actions")
        .getBoundingClientRect().bottom,
      diffTop: document.querySelector(".diff-panes").getBoundingClientRect()
        .top,
    };
  });
  assert.ok(
    layout.actionsBottom <= layout.diffTop,
    "비교 영역이 승인 버튼과 겹치면 안 됩니다.",
  );
}
