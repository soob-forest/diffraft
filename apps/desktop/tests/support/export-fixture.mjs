import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beginRequest, createTask, terminal } from "./generation-fixture.mjs";
import { editor, examples, invoke, root } from "./review-fixture.mjs";

export async function prepareExportReview(name) {
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = workspace.documents.find((item) => item.title === name);
  const base = await readFile(new URL("base_v12.md", examples), "utf8");
  for (let version = 1; version < 12; version++)
    await editor({
      kind: "save",
      documentId: document.id,
      expectedVersion: version,
      content: base,
      operationId: crypto.randomUUID(),
    });
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".sidebar ul").$(`button=${name}`).click();
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === "v12",
  );
  const taskId = await createTask("여행 준비 명확화");
  await beginRequest("PATCH", "PATCH", "세 변경을 제안해 주세요.");
  assert.equal((await terminal(taskId)).lastAttempt.status, "SUCCEEDED");
  await $('[data-testid="diff-stats"]').waitForDisplayed();
  return { documentId: document.id, taskId, base };
}

export async function openExport() {
  await $("button=확정본 내보내기").click();
  await $(".export-dialog[open]").waitForDisplayed();
}

export async function copyAndAssert(content) {
  await $("button=Markdown 복사").click();
  await browser.waitUntil(async () =>
    (await $(".export-dialog [role=status]").getText()).includes(
      "복사했습니다",
    ),
  );
  assert.equal(
    execFileSync("/usr/bin/pbpaste", [], { encoding: "utf8" }),
    content,
  );
}

export async function saveCopy(name, content) {
  await writeFile(join(root, "next-export"), name);
  await $("button=.md 사본 저장").click();
  await browser.waitUntil(async () =>
    (await $(".export-dialog [role=status]").getText()).includes(
      "사본 저장 완료",
    ),
  );
  assert.equal(await readFile(join(root, `${name}.md`), "utf8"), content);
}

export async function waitVersion(version) {
  await browser.waitUntil(
    async () => (await $(".version-badge").getText()) === `v${version}`,
  );
}

export async function addReviewComment() {
  await $("button=3번 변경").click();
  await $(".comment-form summary").click();
  await $(".comment-form textarea").setValue(
    "여행자의 준비 내용를 명시해 주세요.",
  );
  await $("button=코멘트 저장").click();
  await browser.waitUntil(async () =>
    (await $(".comment-list").getText()).includes("여행자"),
  );
}
