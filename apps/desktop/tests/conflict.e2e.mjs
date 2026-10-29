import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";

const root = process.env.DOCREVIEW_E2E_DATA;
const file = join(root, "conflict-review.md");
const source = '[data-testid="source-editor"]';
const buffer = "# 앱 버퍼\n보존할 한글 😀\n";
let documentId;
async function invoke(command, args) {
  return browser.execute(
    (name, payload) => window.__TAURI__.core.invoke(name, payload),
    command,
    args,
  );
}
async function state() {
  return (
    await invoke("editor_command", {
      request: { schemaVersion: 1, action: { kind: "read", documentId } },
    })
  ).value;
}
async function conflict(content) {
  if (content === null) await rm(file);
  else await writeFile(file, content);
  await browser.waitUntil(
    async () =>
      (await $('[data-testid="save-status"]').getText()) === "원문 저장 중지",
  );
  await $(source).click();
  await browser.keys([Key.Command, "a"]);
  await $(source).addValue(buffer);
  await $("button=파일 비교·복구").click();
  await $(".conflict-dialog[open]").waitForDisplayed();
}
async function closedAtVersion(version) {
  await browser.waitUntil(async () => !(await $("dialog[open]").isExisting()));
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === `v${version}`,
  );
}
describe("외부 파일 충돌 해결", () => {
  it("앱 버퍼와 외부 파일을 비교하고 외부 파일을 새 버전으로 수용한다", async () => {
    await writeFile(join(root, "next-pick"), "conflict-review");
    await $("button=문서 열기").click();
    await $(source).waitForDisplayed();
    const workspace = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    documentId = workspace.documents.find(
      (item) => item.title === "conflict-review",
    ).id;
    await conflict("# 외부 내용\n다른 작성자의 수정\n");
    await browser.waitUntil(
      async () => await $("button=외부 파일 사용").isEnabled(),
    );
    assert.match(await $(".conflict-dialog .diff-pane").getText(), /앱 버퍼/);
    assert.match(
      await $(".conflict-dialog .diff-pane").getText(),
      /다른 작성자/,
    );
    await browser.saveScreenshot(".artifacts/conflict-comparison.png");
    await $("button=외부 파일 사용").click();
    await closedAtVersion(2);
    assert.equal(
      (await state()).document.content,
      "# 외부 내용\n다른 작성자의 수정\n",
    );
    assert.equal(
      await readFile(file, "utf8"),
      (await state()).document.content,
    );
    await $("button=파일 비교·복구").click();
    await $(".recovery-copies summary").click();
    await $(".recovery-copies button").click();
    await browser.waitUntil(async () =>
      (await $(".recovery-copies pre").getText()).includes("보존할 한글"),
    );
    await $("button=닫기").click();
  });
  it("확인 후 다시 변경된 외부 파일을 덮지 않고 재확인 후 통합한다", async () => {
    await conflict("# 외부 두 번째\n");
    await $(".conflict-merge summary").click();
    await $(".conflict-merge textarea").setValue(
      "# 통합 결과\n앱과 외부 내용\n",
    );
    await writeFile(file, "# 확인 후 또 변경됨\n");
    await $("button=통합 내용을 새 버전으로 저장").click();
    await browser.waitUntil(async () =>
      (await $(".conflict-dialog [role=status]").getText()).includes("변경"),
    );
    assert.equal((await state()).document.version, 2);
    assert.equal(await readFile(file, "utf8"), "# 확인 후 또 변경됨\n");
    assert.equal(
      await $(".conflict-merge textarea").getValue(),
      "# 통합 결과\n앱과 외부 내용\n",
    );
    await $("button=파일 다시 확인").click();
    await browser.waitUntil(async () =>
      (await $(".conflict-dialog .diff-pane").getText()).includes(
        "확인 후 또 변경됨",
      ),
    );
    await $("button=통합 내용을 새 버전으로 저장").click();
    await closedAtVersion(3);
    assert.equal(await readFile(file, "utf8"), "# 통합 결과\n앱과 외부 내용\n");
  });
  it("삭제된 파일은 재생성하지 않고 앱 사본을 저장한 뒤 문서를 이동한다", async () => {
    await conflict(null);
    await $(".conflict-app-buffer").waitForDisplayed();
    assert.equal(await $("button=외부 파일 사용").isEnabled(), false);
    assert.equal(await $(".conflict-dialog .diff-viewer").isExisting(), false);
    await writeFile(join(root, "next-copy"), "cancel");
    await $("button=앱 내용 사본 저장").click();
    await browser.waitUntil(async () =>
      (await $(".conflict-dialog [role=status]").getText()).includes("취소"),
    );
    await writeFile(join(root, "next-copy"), "buffer-copy");
    await $("button=앱 내용 사본 저장").click();
    await browser.waitUntil(async () =>
      (await $(".conflict-dialog [role=status]").getText()).includes(
        "사본 저장 완료",
      ),
    );
    assert.equal(await readFile(join(root, "buffer-copy.md"), "utf8"), buffer);
    await assert.rejects(readFile(file), { code: "ENOENT" });
    assert.equal((await state()).document.version, 3);
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/conflict-copy.png");
    await $("button=닫기").click();
    await $("button=새 문서").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "새 문서",
    );
    await $(".sidebar").$("button=conflict-review").click();
    await browser.waitUntil(
      async () =>
        (await $(".document-toolbar h1").getText()) === "conflict-review",
    );
    await $("button=파일 비교·복구").click();
    await $(".recovery-copies summary").click();
    await $(".recovery-copies button").click();
    await browser.waitUntil(async () =>
      (await $(".recovery-copies pre").getText()).includes("보존할 한글"),
    );
  });
});
