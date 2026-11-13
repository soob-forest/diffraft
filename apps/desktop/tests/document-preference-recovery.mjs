import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { documentAction } from "./support/document-menu.mjs";
import { invoke, root } from "./support/review-fixture.mjs";
import { resizeContent } from "./support/tobe-fixture.mjs";

const key = "docreview.document-list.v2";
async function snapshot() {
  return invoke("get_workspace_snapshot", { request: { schemaVersion: 1 } });
}
export async function corruptPreferencesKeepDocumentsUsable() {
  await resizeContent(1440, 900);
  const saved = await browser.execute((key) => localStorage.getItem(key), key);
  const before = await snapshot();
  try {
    await browser.execute((key) => {
      localStorage.setItem(key, "{");
      location.reload();
    }, key);
    await browser.waitUntil(async () =>
      (await $(".workspace-body > .error-banner").getText()).includes("형식"),
    );
    await openWithInvalidPreferences(before.documents.length);
    await verifyCompactWarning();
    await verifyBlockedCompletion();
    await browser.saveScreenshot(
      ".artifacts/document-management/preference-warning.png",
    );
  } finally {
    await browser.execute(
      (key, value) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      key,
      saved,
    );
  }
}

async function verifyCompactWarning() {
  await resizeContent(800, 600);
  await assertPreferenceWarning();
  assert.equal(
    await browser.execute(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await browser.saveScreenshot(
    ".artifacts/document-management/preference-warning-compact.png",
  );
  await resizeContent(1440, 900);
}

async function openWithInvalidPreferences(documentCount) {
  await $(".document-actions").$("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  assert.equal((await snapshot()).documents.length, documentCount + 1);
  await assertPreferenceWarning();
  await writeFile(join(root, "next-pick"), "document");
  await $(".document-actions").$("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "document",
  );
  await assertPreferenceWarning();
}

async function verifyBlockedCompletion() {
  const opened = await snapshot();
  await documentAction("document", "완료로 이동");
  await browser.waitUntil(
    async () => (await $(".workspace-body").getAttribute("inert")) === null,
  );
  assert.equal(
    (await snapshot()).selectedDocumentId,
    opened.selectedDocumentId,
  );
  assert.equal(
    await browser.execute((key) => localStorage.getItem(key), key),
    "{",
  );
}
async function assertPreferenceWarning() {
  assert.match(
    await $(".workspace-body > .error-banner").getText(),
    /목록.*형식.*열었습니다/s,
  );
  assert.equal(
    await browser.execute((key) => localStorage.getItem(key), key),
    "{",
  );
}
