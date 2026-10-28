import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = process.env.DOCREVIEW_E2E_DATA;
export const examples = new URL("../../../../docs/examples/", import.meta.url);
export async function invoke(command, args) {
  return browser.execute(
    (name, payload) => window.__TAURI__.core.invoke(name, payload),
    command,
    args,
  );
}
export async function editor(action) {
  return (
    await invoke("editor_command", { request: { schemaVersion: 1, action } })
  ).value;
}
function fakeResponse() {
  const script = fileURLToPath(
    new URL("../fixtures/fake-claude.mjs", import.meta.url),
  );
  const child = spawnSync(process.execPath, [script, "PATCH"], {
    input: JSON.stringify({ schemaVersion: 1 }),
    encoding: "utf8",
    env: {},
    timeout: 5000,
  });
  assert.equal(child.status, 0);
  return JSON.stringify(JSON.parse(child.stdout).structured_output);
}
export async function prepare(name) {
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
  const task = await createTask(document, base);
  const batch = await invoke("e2e_register_ai", {
    documentId: document.id,
    taskId: task.id,
    responseJson: fakeResponse(),
  });
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".sidebar").$(`button=${name}`).click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  await $("button=변경 검토").click();
  await $('[data-testid="diff-stats"]').waitForDisplayed();
  return { document, task, base, batch };
}
async function createTask(document, base) {
  for (let version = 1; version < 12; version++)
    await editor({
      kind: "save",
      documentId: document.id,
      expectedVersion: version,
      content: base,
      operationId: crypto.randomUUID(),
    });
  return editor({
    kind: "put_task",
    task: {
      id: crypto.randomUUID(),
      documentId: document.id,
      goal: "여행 준비 명확화",
      pinnedRules: "수치 유지",
      summary: "",
    },
  });
}
