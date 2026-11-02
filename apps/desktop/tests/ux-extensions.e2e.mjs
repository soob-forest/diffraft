import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { invoke, prepare, root } from "./support/review-fixture.mjs";

let fixture, addedId, candidate;
const review = async (action) =>
  (await invoke("review_command", { request: { schemaVersion: 1, action } }))
    .value;
async function selectLine(text) {
  const split = $("button=나란히");
  if ((await split.getAttribute("aria-pressed")) !== "true")
    await split.click();
  let selected;
  for (const line of await $$('[data-testid="diff-after"] .cm-line'))
    if ((await line.getText()).includes(text)) {
      selected = line;
      break;
    }
  assert.ok(selected, `expected synthetic line: ${text}`);
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
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".selected-request-form textarea").waitForDisplayed();
  await $(".selected-request-form textarea").setValue("이 인용만 쉽게");
}
async function execute(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $(".selected-request-form").$("button=요청 내용 확인").click();
  await $(".selection-confirmation").waitForDisplayed();
  await $(".selection-confirmation").$("button=확인 후 요청").click();
}
async function latest() {
  return invoke("task_conversation", {
    request: { schemaVersion: 1 },
    taskId: fixture.task.id,
    before: null,
  });
}
describe("확정 문맥과 전체 후보 선택 수정", () => {
  it("변경 없는 문맥을 새 묶음으로 제안하고 기존 활성 제안을 보존한다", async () => {
    await mkdir(".artifacts/ux", { recursive: true });
    fixture = await prepare("regeneration");
    await $(".diff-toolbar input[type=checkbox]").click();
    await selectLine("출발 시간과 이동 경로를 함께 기록합니다.");
    await execute("REGENERATE");
    await browser.waitUntil(
      async () => (await latest()).lastAttempt?.status === "SUCCEEDED",
    );
    const result = (await latest()).messages
      .filter((m) => m.result)
      .at(-1).result;
    addedId = result.batchId;
    assert.notEqual(addedId, fixture.batch.id);
    const previous = await review({
      kind: "projection",
      batchId: fixture.batch.id,
      expectedHeadId: fixture.batch.applyHeadId,
    });
    assert.equal(previous.batch.status, "ACTIVE");
    assert.deepEqual(previous.batch.proposals, fixture.batch.proposals);
    assert.equal(
      await readFile(join(root, "regeneration.md"), "utf8"),
      fixture.base,
    );
    await browser.saveScreenshot(".artifacts/ux/confirmed-selection.png");
  });
  it("전체 재작성 요청을 같은 작성 폼에서 확인하고 새 전체 후보를 연다", async () => {
    await $(".panel-tabs").$("button=작업·대화").click();
    await $(".request-kind").$("button=전체 재작성").click();
    await $(".request-form textarea").setValue("합성 전체 재작성");
    await $(".request-form").$("button=요청 내용 확인").click();
    await $(".generation-dialog").waitForDisplayed();
    await writeFile(join(root, "next-generation"), "REWRITE");
    await $(".generation-dialog").$("button=확인 후 요청").click();
    await $(".rewrite-comparison-heading").waitForDisplayed();
    candidate = await readFile(
      new URL("../../../docs/examples/rewrite_W02.md", import.meta.url),
      "utf8",
    );
    await browser.saveScreenshot(".artifacts/ux/whole-candidate.png");
  });
  it("전체 후보의 선택 밖 문구를 보존하고 전체 적용 원칙을 유지한다", async () => {
    await selectLine(candidate.split("\n")[0]);
    await execute("REGENERATE");
    await browser.waitUntil(
      async () =>
        (await latest()).lastAttempt?.request.kind === "selection" &&
        (await latest()).lastAttempt.status === "SUCCEEDED",
    );
    const page = await latest(),
      saved = page.lastAttempt.request.value,
      result = page.messages.filter((m) => m.result).at(-1).result;
    const selection = saved.target.value.selection;
    const projection = await review({
      kind: "projection",
      batchId: result.batchId,
      expectedHeadId: fixture.batch.applyHeadId,
    });
    assert.equal(projection.batch.mode, "REWRITE");
    assert.equal(
      projection.after,
      candidate.slice(0, selection.fromUtf16) +
        "다듬은 부분" +
        candidate.slice(selection.toUtf16),
    );
    assert.equal(
      await readFile(join(root, "regeneration.md"), "utf8"),
      fixture.base,
    );
    await browser.saveScreenshot(".artifacts/ux/rewrite-selection.png");
  });
});
