import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./review-fixture.mjs";
import {
  foregroundUnitDisplay,
  settleUnitDisplay,
} from "./unit-review-display.mjs";

export const source =
  "첫 번째 noise\n\n- 두 번째 noise\n\n세 번째 noise\n\n1. 네 번째 noise\n\n다섯 번째 noise\n";
export const partial = source.replace("첫 번째 noise", "첫 번째");
export const final = source
  .replaceAll(" noise", "")
  .replace("두 번째", "두 번째 noise");

export async function openPatchFixture(name, text = source, replacements) {
  await writeFile(join(root, `${name}.md`), text);
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  await $("button=원문").click();
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = snapshot.documents.find((d) => d.title === name);
  assert(document);
  const task = await editor({
    kind: "put_task",
    task: {
      id: crypto.randomUUID(),
      documentId: document.id,
      goal: "독립 삭제 검토",
      pinnedRules: "",
      summary: "",
    },
  });
  const batch = await registerFixture(document, task, replacements);
  return { document, task, batch, text, name };
}

export async function showPatchFixture(name) {
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await browser.execute((title) => {
    const target = [...document.querySelectorAll(".sidebar button")].find(
      (b) => b.textContent.trim() === title,
    );
    if (!target) throw new Error("합성 문서를 찾을 수 없습니다.");
    target.click();
  }, name);
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  await $("button=변경 검토").click();
  await $(".selected-group h3").waitForDisplayed();
}

export function makeLegacyFixture(batch) {
  assert.match(batch.id, /^[a-f0-9-]{36}$/);
  const database = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    database,
    `BEGIN;
    DELETE FROM patch_reviews WHERE batch_id='${batch.id}';
    UPDATE proposals SET group_id=(SELECT group_id FROM proposals WHERE batch_id='${batch.id}' LIMIT 1)
      WHERE batch_id='${batch.id}'; COMMIT;`,
  ]);
}

export async function projection(fixture) {
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  const reply = await invoke("review_command", {
    request: {
      schemaVersion: 1,
      action: {
        kind: "projection",
        batchId: fixture.batch.id,
        expectedHeadId: state.document.versionId,
      },
    },
  });
  return reply.value;
}

export async function savePatchState(fixture) {
  await writeFile(
    join(root, "patch-groups-state.json"),
    JSON.stringify(fixture),
  );
}

export async function loadPatchState() {
  return JSON.parse(
    await readFile(join(root, "patch-groups-state.json"), "utf8"),
  );
}

export async function waitGroups(count) {
  await browser.waitUntil(async () =>
    (await $(".selected-group h3").getText()).includes(`/ ${count}`),
  );
  await browser.waitUntil(async () => $("button=선택한 변경 승인").isEnabled());
}

export async function checkPatchLayout() {
  const size = await browser.getWindowSize();
  try {
    await browser.setWindowSize(800, 600);
    for (const zoom of [1, 1.5, 2]) {
      await foregroundUnitDisplay(zoom);
      const back = $("button=본문으로 돌아가기"),
        close = $("button=요청·상세 접기");
      if (await back.isDisplayed()) await back.click();
      else if (await close.isDisplayed()) await close.click();
      await settleUnitDisplay();
      const accept = $("button=선택한 변경 승인"),
        reject = $("button=선택한 변경 거절");
      await accept.scrollIntoView();
      await accept.waitForClickable();
      await reject.waitForClickable();
      assert.match(await $(".selected-group h3").getText(), /1 \/ 5/);
      await browser.saveScreenshot(`.artifacts/patch-groups-800-${zoom}.png`);
    }
  } finally {
    await browser.execute(async () => {
      await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(1);
    });
    await browser.setWindowSize(size.width, size.height);
  }
}

async function registerFixture(document, task, replacements) {
  const scope = await editor({
    kind: "scope",
    documentId: document.id,
    expectedVersion: document.headVersion,
    selection: { kind: "whole" },
  });
  const changes = replacements
    ? replacements.map(([before, after]) => ({
        block_id: scope.blocks.find((b) => b.text.includes(before)).id,
        before,
        after,
        reason: "합성 회귀 변경",
      }))
    : scope.blocks
        .filter((b) => b.text.includes("noise"))
        .map((b) => ({
          block_id: b.id,
          before: b.text,
          after: b.text.replaceAll(" noise", ""),
          reason: "합성 불필요 문구 삭제",
        }));
  return invoke("e2e_register_ai", {
    documentId: document.id,
    taskId: task.id,
    responseJson: JSON.stringify({
      schema_version: 1,
      mode: "PATCH",
      summary: "독립 삭제",
      changes,
    }),
  });
}
