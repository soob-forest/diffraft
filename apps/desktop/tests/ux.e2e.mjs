import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { invoke, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";
import { checkSelectedLayouts } from "./support/ux-layout.mjs";

let fixture, quote, target;
async function batch() {
  return (
    await invoke("review_command", {
      request: {
        schemaVersion: 1,
        action: {
          kind: "projection",
          batchId: fixture.batch.id,
          expectedHeadId: fixture.batch.applyHeadId,
        },
      },
    })
  ).value.batch;
}
async function confirm(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $(".selected-request-form").$("button=요청 내용 확인").click();
  await $(".selection-confirmation").waitForDisplayed();
  assert.equal(await $(".selected-request-form textarea").isExisting(), false);
  await $(".selection-confirmation").$("button=확인 후 요청").waitForEnabled();
  await $(".selection-confirmation").scrollIntoView({ block: "end" });
  await browser.saveScreenshot(".artifacts/ux/request-confirm.png");
  await $(".selection-confirmation").$("button=확인 후 요청").click();
}
describe("선택 수정과 로컬 초안", () => {
  it("후보 선택에서 지시를 한 번 작성하고 확인 전에 AI를 실행하지 않는다", async () => {
    await mkdir(".artifacts/ux", { recursive: true });
    fixture = await prepare("review");
    await chooseGroup(1);
    await $("button=나란히").click();
    const lines = await $$('[data-testid="diff-after"] .cm-line.diff-insert');
    target = fixture.batch.proposals.find((proposal) =>
      proposal.operation.headingPath.at(-1).startsWith("1."),
    );
    let selected;
    for (const line of lines) {
      if ((await line.getText()).includes(target.operation.after)) {
        selected = line;
        break;
      }
    }
    assert.ok(selected, "후보 행이 있어야 합니다");
    await selected.click();
    await browser.execute(() =>
      document.querySelector('[data-testid="diff-after"]').focus(),
    );
    await browser.keys([Key.Command, Key.ArrowLeft]);
    await browser.keys([
      Key.Shift,
      Key.ArrowRight,
      Key.ArrowRight,
      Key.ArrowRight,
    ]);
    await browser.saveScreenshot(".artifacts/ux/selection-before-entry.png");
    await writeFile(
      ".artifacts/ux/selection-state.json",
      JSON.stringify(
        await browser.execute(() => ({
          selected: window.getSelection()?.toString(),
          active: document.activeElement?.getAttribute("data-testid"),
          tools: [...document.querySelectorAll(".review-tools")].map(
            (element) => element.textContent,
          ),
        })),
      ),
    );
    await $(".selection-context").$("button=이 부분 수정").waitForDisplayed();
    await $(".selection-context").$("button=이 부분 수정").click();
    await $(".selected-request-form textarea").waitForDisplayed();
    quote = await $(".selected-request-form blockquote").getText();
    assert.ok(quote.length > 0);
    assert.ok(target.operation.after.includes(quote));
    await $(".selected-request-form textarea").setValue("이 부분만 간결하게");
    assert.equal(
      await $(".selection-context").isExisting(),
      false,
      "작성 패널에서는 떠 있는 선택 도구를 닫아야 합니다",
    );
    assert.equal(
      (await batch()).proposals.find((proposal) => proposal.id === target.id)
        .revision,
      1,
    );
    await browser.saveScreenshot(".artifacts/ux/selection-request.png");
  });
  it("범위를 어긴 응답은 거부하고 인용·지시·기존 후보를 유지한다", async () => {
    await confirm("REGENERATE_WRONG_SELECTION");
    await browser.waitUntil(async () =>
      (await $(".selected-request-form").getText()).includes("범위가 맞지"),
    );
    assert.equal(
      (await batch()).proposals.find((proposal) => proposal.id === target.id)
        .revision,
      1,
    );
    assert.equal(
      await $(".selected-request-form textarea").getValue(),
      "이 부분만 간결하게",
    );
    assert.equal(await $(".selected-request-form blockquote").getText(), quote);
    assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
    await browser.saveScreenshot(".artifacts/ux/selection-failure.png");
    await checkSelectedLayouts("이 부분만 간결하게", "error");
  });
  it("정확한 부분만 새 미승인 revision으로 교체하고 다른 제안과 확정본을 보존한다", async () => {
    await confirm("REGENERATE");
    await browser.waitUntil(
      async () =>
        (await batch()).proposals.find((proposal) => proposal.id === target.id)
          .revision === 2,
    );
    const result = await batch(),
      original = target.operation.after;
    const page = await invoke("task_conversation", {
      request: { schemaVersion: 1 },
      taskId: fixture.task.id,
      before: null,
    });
    const selection = page.lastAttempt.request.value.options.target.value;
    assert.equal(
      result.proposals.find((proposal) => proposal.id === target.id).operation
        .after,
      original.slice(0, selection.fromUtf16) +
        "다듬은 부분" +
        original.slice(selection.toUtf16),
    );
    assert.equal(
      result.proposals.find((proposal) => proposal.id === target.id).decision,
      "PENDING",
    );
    assert.deepEqual(
      result.proposals.filter((proposal) => proposal.id !== target.id),
      fixture.batch.proposals.filter((proposal) => proposal.id !== target.id),
    );
    assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
    await browser.saveScreenshot(".artifacts/ux/revised-candidate.png");
    await $("button=원문").click();
    await $(".request-form textarea").waitForEnabled();
    await $(".request-form textarea").setValue("앱 재실행 후 복원할 요청");
    await browser.waitUntil(async () =>
      (await $("footer .draft-status").getText()).includes("저장됨"),
    );
    await writeFile(
      join(root, "ux-expected.json"),
      JSON.stringify({
        documentId: fixture.document.id,
        taskId: fixture.task.id,
      }),
    );
  });
});
