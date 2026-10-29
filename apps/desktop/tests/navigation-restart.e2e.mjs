import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./support/review-fixture.mjs";

describe("재시작한 앱의 마지막 위치", () => {
  it("직접 다시 선택하지 않아도 마지막 문서와 작업으로 돌아온다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "navigation-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.processId);
    await $(".document-toolbar h1").waitForExist();
    assert.equal(await $(".document-toolbar h1").getText(), "rewrite");
    assert.equal(await $(".task-picker select").getValue(), expected.bLast);
    await $(".sidebar").$("button=document").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    assert.equal(await $(".task-picker select").getValue(), expected.aLast);
  });
});
