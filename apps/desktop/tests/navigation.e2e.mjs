import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { holdDatabase } from "./support/database-lock.mjs";
import { chooseTask, createTask } from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

const picker = ".task-panel > label select";
let aFirst, aLast, bLast;
async function open(name) {
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
}
async function visit(name) {
  await $(".sidebar").$(`button=${name}`).click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
}

describe("마지막 문서·문서별 작업 선택 보존", () => {
  it("두 문서 사이를 이동해도 마지막 작업과 명시적인 새 작업 선택을 유지한다", async () => {
    await open("document");
    aFirst = await createTask("A 첫 작업");
    aLast = await createTask("A 이어갈 작업");
    await open("rewrite");
    await createTask("B 첫 작업");
    bLast = await createTask("B 이어갈 작업");
    await visit("document");
    assert.equal(await $(picker).getValue(), aLast);
    await chooseTask("");
    await visit("rewrite");
    assert.equal(await $(picker).getValue(), bLast);
    await visit("document");
    assert.equal(await $(picker).getValue(), "");
    await chooseTask(aLast);
  });

  it("선택 저장이 실패하면 현재 문서·작업을 유지하고 재시도할 수 있다", async () => {
    const release = await holdDatabase();
    try {
      await browser.execute((id) => {
        const select = document.querySelector(".task-panel > label select");
        select.value = id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, aFirst);
      await $(".task-panel > [role=alert]").waitForDisplayed();
      assert.equal(await $(picker).getValue(), aLast);
      await $(".sidebar").$("button=rewrite").click();
      await $(".workspace-body > .error-banner").waitForDisplayed();
      assert.equal(await $(".document-toolbar h1").getText(), "document");
    } finally {
      await release();
    }
    await chooseTask(aFirst);
    await chooseTask(aLast);
    await visit("rewrite");
    assert.equal(await $(picker).getValue(), bLast);
    await writeFile(
      join(root, "navigation-expected.json"),
      JSON.stringify({
        aLast,
        bLast,
        processId: await invoke("e2e_process_id", {}),
      }),
    );
  });
});
