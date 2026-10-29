import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { createTask } from "./generation-fixture.mjs";
import { editor, invoke, root } from "./review-fixture.mjs";

const INSERTED = "| 추가된 명령 😀 | 설명 |";
export async function checkFoldedNavigation() {
  const source = [
    "# 긴 표",
    "",
    "| 명령 | 설명 |",
    "| --- | --- |",
    ...Array.from({ length: 40 }, (_, i) => `| 명령 ${i} | 설명 |`),
    "",
  ].join("\n");
  await writeFile(join(root, "layout.md"), source);
  await writeFile(join(root, "next-pick"), "layout");
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "layout",
  );
  const taskId = await createTask("접힌 표의 추가 행 이동 검사");
  const { documents } = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = documents.find((value) => value.title === "layout");
  await registerTableChange(document, taskId);
  await $("button=변경 검토").click();
  await $('[data-testid="diff-inline"]').waitForDisplayed();
  assert.ok((await $$(".diff-folds button")).length > 0);
  await jumpFromEnd("inline", "F7");
  await jumpFromEnd("inline", [Key.Shift, "F7"]);
  await $("button=나란히").click();
  await jumpFromEnd("after", "F7");
  await $("button=인라인").click();
  assert.ok(
    (await $$(".diff-folds button")).length > 0,
    "이동이 문맥을 강제로 펼치면 안 됩니다.",
  );
  assert.equal(await readFile(join(root, "layout.md"), "utf8"), source);
  assert.equal(await $('[data-testid="diff-stats"]').getText(), "+1 / −0");
  await browser.saveScreenshot(".artifacts/review-folded-navigation.png");
}

async function registerTableChange(document, taskId) {
  const scope = await editor({
    kind: "scope",
    documentId: document.id,
    expectedVersion: document.headVersion,
    selection: { kind: "whole" },
  });
  const block = scope.blocks.find((value) => value.text.startsWith("| 명령 |"));
  assert.ok(block, "표 블록이 있어야 합니다.");
  const before = block.text.trimEnd();
  await invoke("e2e_register_ai", {
    documentId: document.id,
    taskId,
    responseJson: JSON.stringify({
      schema_version: 1,
      mode: "PATCH",
      summary: "표 중간 추가",
      changes: [
        {
          block_id: block.id,
          before,
          after: before.replace(
            "| 명령 20 | 설명 |",
            `${INSERTED}\n| 명령 20 | 설명 |`,
          ),
          reason: "합성 회귀 fixture",
        },
      ],
    }),
  });
}

async function jumpFromEnd(side, keys) {
  const pane = $(`[data-testid="diff-${side}"]`);
  await pane.click();
  await browser.keys([Key.Command, Key.ArrowDown]);
  await browser.keys(keys);
  await browser.waitUntil(
    async () =>
      browser.execute((inserted) => {
        const selection = window.getSelection();
        const node = selection?.anchorNode;
        const element =
          node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        return element?.closest(".cm-line")?.textContent === inserted;
      }, INSERTED),
    {
      timeoutMsg: "F7은 접힌 표 시작점 대신 실제 추가 행으로 이동해야 합니다.",
    },
  );
}
