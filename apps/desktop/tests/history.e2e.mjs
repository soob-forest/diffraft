import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { saveDocument } from "./support/review-ui.mjs";

const root = process.env.DOCREVIEW_E2E_DATA;
const source = '[data-testid="source-editor"]';
const original = "\ufeff# 로컬 문서\r\n\r\n한글 😀 원문\r\n";
const edited = "# 복원 전 편집\r\n직접 입력한 문장\r\n";
let documentId;
async function snapshot() {
  return browser.execute(
    (id) =>
      window.__TAURI__.core.invoke("editor_command", {
        request: { schemaVersion: 1, action: { kind: "read", documentId: id } },
      }),
    documentId,
  );
}
async function version(number) {
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === `v${number}`,
  );
}
async function compare(number) {
  await $(`button=v${number} 비교·복원`).click();
  await $(".restore-dialog").waitForDisplayed();
}
async function assertLineNumbers() {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const lines = [
          ...document.querySelectorAll(".restore-dialog .cm-content .cm-line"),
        ];
        const numbers = [
          ...document.querySelectorAll(
            ".restore-dialog .diff-numbers .cm-gutterElement",
          ),
        ];
        return (
          lines.length >= 5 &&
          lines.every(
            (line, index) =>
              Math.abs(
                line.getBoundingClientRect().top -
                  numbers[index].getBoundingClientRect().top,
              ) < 2,
          )
        );
      }),
    { timeoutMsg: "복원 비교의 원문 행과 줄 번호가 정렬되어야 합니다." },
  );
}
async function prepare() {
  await writeFile(join(root, "next-pick"), "document");
  await $("button=문서 열기").click();
  await $(source).waitForDisplayed();
  const workspace = await browser.execute(() =>
    window.__TAURI__.core.invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    }),
  );
  documentId = workspace.documents.find(
    (value) => value.title === "document",
  ).id;
  await $(source).click();
  await browser.keys([Key.Command, "a"]);
  await $(source).addValue(edited.replaceAll("\r\n", "\n"));
  await version(2);
  await $(".version-history summary").click();
  await $("button=v1 비교·복원").waitForDisplayed();
}

async function assertTextDiff() {
  await $("summary=텍스트로 변경 읽기").click();
  const changes = await $(
    '.text-diff ol[aria-label="삭제와 추가된 행"]',
  ).getText();
  assert.match(changes, /삭제 · 변경 전 1행/);
  assert.match(changes, /추가 · 변경 후 1행/);
  assert.match(changes, /복원 전 편집/);
  assert.match(changes, /로컬 문서/);
  assert.match(changes, /\(빈 행\)/);
  await $("summary=텍스트로 변경 읽기").click();
}

describe("버전 비교와 복원", () => {
  it("현재→대상 방향의 읽기 전용 diff를 보여주고 취소하면 현재 파일을 유지한다", async () => {
    await prepare();
    await compare(1);
    assert.equal(
      await $("#restore-title").getText(),
      "현재 v2 → 복원할 v1 내용",
    );
    assert.match(
      await $(".restore-dialog .diff-delete").getText(),
      /복원 전 편집/,
    );
    assert.match(
      await $(".restore-dialog .diff-insert").getText(),
      /로컬 문서/,
    );
    assert.equal(
      await $('.restore-dialog [data-testid="diff-inline"]').getAttribute(
        "contenteditable",
      ),
      "false",
    );
    await mkdir(".artifacts", { recursive: true });
    await assertLineNumbers();
    await browser.saveScreenshot(".artifacts/restore-comparison.png");
    await assertTextDiff();
    await $("button=복원 취소").click();
    assert.equal(
      await browser.execute(() => document.activeElement?.textContent),
      "v1 비교·복원",
    );
    assert.equal(await readFile(join(root, "document.md"), "utf8"), edited);
    assert.equal((await snapshot()).value.document.version, 2);
    await compare(1);
    await browser.keys(Key.Escape);
    assert.equal(
      await browser.execute(() => document.activeElement?.textContent),
      "v1 비교·복원",
    );
  });
  it("대상 내용을 새 버전으로 복원하고 undo·redo가 복원 경계를 넘지 않는다", async () => {
    await compare(1);
    await $("button=v1 내용으로 복원").click();
    await version(3);
    await browser.waitUntil(
      async () => !(await $(".restore-dialog").isExisting()),
    );
    assert.equal(await readFile(join(root, "document.md"), "utf8"), original);
    await $(source).click();
    await browser.keys([Key.Command, "z"]);
    await browser.keys([Key.Command, Key.Shift, "z"]);
    await saveDocument();
    const state = (await snapshot()).value;
    assert.equal(state.document.version, 3);
    assert.equal(state.document.content, original);
    assert.equal(state.versions.length, 3);
    assert.equal(state.versions[0].reason, "restore");
    assert.match(await $(".version-history").getText(), /버전 복원/);
  });
  it("확인 후 외부 파일이 바뀌면 복원하지 않고 외부 내용을 보존한다", async () => {
    await compare(2);
    await writeFile(join(root, "document.md"), "# 외부에서 최종 변경\n");
    await $("button=v2 내용으로 복원").click();
    await browser.waitUntil(async () =>
      (await $(".document-main").getText()).includes("외부"),
    );
    assert.equal(
      await readFile(join(root, "document.md"), "utf8"),
      "# 외부에서 최종 변경\n",
    );
    assert.equal((await snapshot()).value.document.version, 3);
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/restore-conflict.png");
  });
  it("긴 텍스트 변경을 50행씩 읽고 HTML 문자는 본문 그대로 표시한다", async () => {
    await $("button=새 문서").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "새 문서",
    );
    const text = Array.from(
      { length: 60 },
      (_, index) => `${index + 1}행 <img src=x> 한글 😀`,
    ).join("\n");
    await $(source).addValue(text);
    await version(2);
    await $(".version-history summary").click();
    await compare(1);
    assert.equal(await $(".text-diff ol").isExisting(), false);
    await $("summary=텍스트로 변경 읽기").click();
    assert.equal((await $$(".text-diff li")).length, 50);
    assert.equal(
      await $(".text-diff li strong").getText(),
      "삭제 · 변경 전 1행",
    );
    assert.equal(
      await $(".text-diff li pre").getText(),
      "1행 <img src=x> 한글 😀",
    );
    assert.equal(await $(".text-diff img").isExisting(), false);
    assert.equal(await $("button=이전 변경 행").isEnabled(), false);
    await $("button=다음 변경 행").click();
    assert.equal((await $$(".text-diff li")).length, 10);
    assert.match(await $(".text-diff li").getText(), /삭제 · 변경 전 51행/);
    assert.equal(await $("button=다음 변경 행").isEnabled(), false);
    await $("button=이전 변경 행").click();
    assert.match(await $(".text-diff li").getText(), /삭제 · 변경 전 1행/);
    await $("button=복원 취소").click();
    const content = await browser.execute(() =>
      [...document.querySelectorAll('[data-testid="source-editor"] .cm-line')]
        .map((line) => line.textContent)
        .join("\n"),
    );
    assert.equal(content, text);
    await version(2);
  });
});
