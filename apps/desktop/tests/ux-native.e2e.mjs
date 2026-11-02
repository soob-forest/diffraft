import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";
import { openFixture } from "./support/tobe-fixture.mjs";
import { selectDiffText } from "./support/ux-ui.mjs";

async function checkpoint(stage) {
  const pid = await invoke("e2e_process_id", {});
  await writeFile(
    ".artifacts/ux/native-session.json",
    JSON.stringify({ stage, pid, root }),
  );
  await browser.waitUntil(
    async () => {
      try {
        await readFile(join(root, `${stage}-done`));
        return true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return false;
      }
    },
    {
      timeout: 600000,
      interval: 500,
      timeoutMsg: "실제 입력기·VoiceOver 검사 완료 신호가 필요합니다.",
    },
  );
}
async function watchComposition() {
  await browser.execute(() => {
    window.uxComposition = { start: 0, end: 0 };
    document.addEventListener(
      "compositionstart",
      () => window.uxComposition.start++,
    );
    document.addEventListener(
      "compositionend",
      () => window.uxComposition.end++,
    );
  });
}
async function verifySourceIme() {
  await mkdir(".artifacts/ux", { recursive: true });
  const fixture = await openFixture("document", "# 입력 검증\n\n", 1);
  await watchComposition();
  await $('[data-testid="source-editor"]').click();
  await checkpoint("source-ime");
  const result = JSON.parse(
    await readFile(join(root, "source-ime-done"), "utf8"),
  );
  if (result.blocked) throw new Error(result.blocked);
  const events = await browser.execute(() => window.uxComposition);
  await writeFile(".artifacts/ux/ime-source.json", JSON.stringify({ events }));
  assert.ok(events.start > 0 && events.end > 0, JSON.stringify(events));
  await browser.waitUntil(async () =>
    (await readFile(join(root, "document.md"), "utf8")).includes("하 한글"),
  );
  assert.ok(fixture.document.id);
  await writeFile(
    ".artifacts/ux/ime-source.json",
    JSON.stringify({ events, confirmed: true }),
  );
}
async function verifySelectedImeAndVoiceOver() {
  const fixture = await prepare("review");
  await chooseGroup(1);
  const target = fixture.batch.proposals.find((p) =>
    p.operation.headingPath.at(-1).startsWith("1."),
  );
  await selectDiffText(target.operation.after);
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".selected-request-form textarea").waitForDisplayed();
  await watchComposition();
  await checkpoint("selected-ime-voiceover");
  const result = JSON.parse(
    await readFile(join(root, "selected-ime-voiceover-done"), "utf8"),
  );
  if (result.blocked) throw new Error(result.blocked);
  assert.ok((await browser.execute(() => window.uxComposition)).start > 0);
  assert.equal(
    result.voiceOverVerified,
    true,
    "실제 VoiceOver의 읽기·이동 검증 기록이 필요합니다.",
  );
  const page = await invoke("task_conversation", {
    request: { schemaVersion: 1 },
    taskId: fixture.task.id,
    before: null,
  });
  assert.equal(page.lastAttempt, null);
  await browser.saveScreenshot(".artifacts/ux/native-selection.png");
  await writeFile(".artifacts/ux/native-result.json", JSON.stringify(result));
}
describe("실제 macOS 입력·스크린리더 수동 검증 연결", () => {
  it(
    "격리된 합성 문서에서 실제 한국어 입력과 저장을 관찰한다",
    verifySourceIme,
  );
  it(
    "선택 수정 입력에서 실제 조합·Esc·VoiceOver를 확인하고 자동 실행하지 않는다",
    verifySelectedImeAndVoiceOver,
  );
});
