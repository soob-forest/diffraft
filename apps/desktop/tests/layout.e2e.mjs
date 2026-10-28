import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  layoutSource,
  longText,
  originalCode,
  revisedCode,
  shortText,
} from "./fixtures/layout.mjs";

const root = process.env.DOCREVIEW_E2E_DATA;
let diagnostic = 0;
async function invoke(command, args) {
  return browser.execute(
    (name, payload) => window.__TAURI__.core.invoke(name, payload),
    command,
    args,
  );
}
async function prepare() {
  await browser.execute(() => {
    window.layoutErrors = [];
    const report = console.error;
    console.error = (...errors) => {
      window.layoutErrors.push(
        errors.map((error) => error?.stack || String(error)).join("\n"),
      );
      report(...errors);
    };
  });
  await writeFile(join(root, "next-pick"), "layout");
  await $("button=문서 열기").click();
  await $('[data-testid="source-editor"]').waitForDisplayed();
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const documentId = workspace.documents.find(
    (item) => item.title === "layout",
  ).id;
  const taskId = crypto.randomUUID();
  await invoke("editor_command", {
    request: {
      schemaVersion: 1,
      action: {
        kind: "put_task",
        task: {
          id: taskId,
          documentId,
          goal: "긴 줄 검토",
          pinnedRules: "",
          summary: "",
        },
      },
    },
  });
  const script = fileURLToPath(
    new URL("./fixtures/fake-claude.mjs", import.meta.url),
  );
  const child = spawnSync(process.execPath, [script, "PATCH_LAYOUT"], {
    input: JSON.stringify({ schemaVersion: 1 }),
    encoding: "utf8",
    env: {},
    timeout: 5000,
  });
  assert.equal(child.status, 0);
  await invoke("e2e_register_ai", {
    documentId,
    taskId,
    responseJson: JSON.stringify(JSON.parse(child.stdout).structured_output),
  });
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".sidebar").$("button=layout").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "layout",
  );
  await $("button=변경 검토").click();
  await $('[data-testid="diff-stats"]').waitForDisplayed();
}
async function alignment() {
  return browser.execute(() => {
    const before = document.querySelector('[data-testid="diff-before"]');
    const after = document.querySelector('[data-testid="diff-after"]');
    if (!before || !after) return null;
    const rows = (pane) => {
      const bounds = pane.closest(".cm-scroller").getBoundingClientRect();
      return [...pane.querySelectorAll(".cm-line")]
        .map((line) => ({
          key: line.dataset.sourceKey,
          top: line.getBoundingClientRect().top,
          height: line.getBoundingClientRect().height,
        }))
        .filter(
          (line) =>
            line.top < bounds.bottom && line.top + line.height > bounds.top,
        );
    };
    return {
      errors: window.layoutErrors,
      before: rows(before),
      after: rows(after),
      overflow: [before, after].some(
        (pane) =>
          pane.closest(".cm-scroller").scrollWidth >
          pane.closest(".cm-scroller").clientWidth + 2,
      ),
    };
  });
}
async function assertAligned() {
  await browser
    .waitUntil(
      async () => {
        const rows = await alignment();
        return (
          rows &&
          !rows.overflow &&
          rows.before.length === rows.after.length &&
          rows.before.every(
            (row, index) =>
              Math.abs(row.top - rows.after[index].top) < 2 &&
              Math.abs(row.height - rows.after[index].height) < 2,
          )
        );
      },
      { timeoutMsg: "줄바꿈된 좌우 논리 행이 정렬되어야 합니다." },
    )
    .catch(async (error) => {
      await mkdir(".artifacts", { recursive: true });
      const path = `.artifacts/layout-failure-${++diagnostic}`;
      await writeFile(
        `${path}.json`,
        JSON.stringify(await alignment(), null, 2),
      );
      await browser.saveScreenshot(`${path}.png`);
      throw error;
    });
  const rows = await alignment();
  assert.deepEqual(rows.errors, []);
  assert.ok(
    rows.after.some((row) => row.key === "insert:null:3" && row.height > 52),
  );
  assert.equal(await $('[data-testid="diff-stats"]').getText(), "+2 / −2");
}
async function firstVisible(side) {
  return browser.execute((side) => {
    const pane = document.querySelector(`[data-testid="diff-${side}"]`);
    const bounds = pane.closest(".cm-scroller").getBoundingClientRect();
    return [...pane.querySelectorAll(".cm-line")].find(
      (row) => row.getBoundingClientRect().bottom > bounds.top + 1,
    )?.dataset.sourceKey;
  }, side);
}
async function scrollTo(side, fraction) {
  await browser.execute(
    (side, fraction) => {
      const scroller = document
        .querySelector(`[data-testid="diff-${side}"]`)
        .closest(".cm-scroller");
      scroller.scrollTop =
        (scroller.scrollHeight - scroller.clientHeight) * fraction;
      scroller.dispatchEvent(new Event("scroll"));
    },
    side,
    fraction,
  );
}
async function sameVisibleRow(side, anchor) {
  await browser
    .waitUntil(async () => (await firstVisible(side)) === anchor)
    .catch(async (error) => {
      const actual = await browser.execute((side) => {
        const pane = document.querySelector(`[data-testid="diff-${side}"]`);
        const scroller = pane.closest(".cm-scroller");
        return {
          top: scroller.scrollTop,
          height: scroller.scrollHeight,
          rows: [...pane.querySelectorAll(".cm-line")].map((row) => ({
            key: row.dataset.sourceKey,
            top:
              row.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top,
            height: row.getBoundingClientRect().height,
          })),
        };
      }, side);
      await writeFile(
        ".artifacts/scroll-failure.json",
        JSON.stringify({ side, anchor, actual }, null, 2),
      );
      throw error;
    });
}
async function roundTrip(fraction) {
  await scrollTo("before", fraction);
  let anchor;
  await browser.waitUntil(async () => {
    anchor = await firstVisible("before");
    return anchor === (await firstVisible("after")) && anchor !== "equal:1:1";
  });
  anchor = await switchView("before", "인라인");
  await sameVisibleRow("inline", anchor);
  anchor = await switchView("inline", "나란히");
  await sameVisibleRow("before", anchor);
}
async function switchView(side, label) {
  await browser.execute((side) => {
    document.addEventListener(
      "click",
      () => {
        const pane = document.querySelector(`[data-testid="diff-${side}"]`);
        const top = pane.closest(".cm-scroller").getBoundingClientRect().top;
        window.scrollAnchorAtClick = [
          ...pane.querySelectorAll(".cm-line"),
        ].find(
          (row) => row.getBoundingClientRect().bottom > top + 1,
        )?.dataset.sourceKey;
      },
      { capture: true, once: true },
    );
  }, side);
  await $(`button=${label}`).click();
  const anchor = await browser.execute(() => window.scrollAnchorAtClick);
  assert.ok(anchor && anchor !== "filler");
  return anchor;
}
describe("긴 줄과 보기 보존", () => {
  it("긴 줄·표·코드를 자동 줄바꿈하고 좌우 논리 행을 맞춘다", async () => {
    await prepare();
    await $("button=나란히").click();
    await assertAligned();
    assert.equal(await readFile(join(root, "layout.md"), "utf8"), layoutSource);
  });
  it("문맥 확장 후 인라인과 나란히 보기를 오가도 스크롤 기준을 유지한다", async () => {
    await $(".diff-toolbar input").click();
    for (const fraction of [0.35, 0.65, 0.85, 0.25, 0.75, 0.45, 0.95, 0.55])
      await roundTrip(fraction);
    await scrollTo("before", 0);
    await assertAligned();
  });
  it("150% 확대와 보기 왕복에서도 논리 행과 승인 범위를 유지한다", async () => {
    await browser.execute(() => {
      document.documentElement.style.zoom = "1.5";
    });
    await assertAligned();
    await $("button=인라인").click();
    await $("button=나란히").click();
    await assertAligned();
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/review-wrap-150.png");
    await browser.execute(() => {
      document.documentElement.style.zoom = "1";
    });
    assert.equal(await readFile(join(root, "layout.md"), "utf8"), layoutSource);
  });
  it("보기 전환 뒤 결합된 변경만 한 버전으로 승인한다", async () => {
    await $("button=인라인").click();
    await $('[data-testid="diff-inline"]').click();
    await browser.keys("F7");
    await $("button=나란히").click();
    await browser.waitUntil(
      async () => await $("button=선택한 변경 승인").isEnabled(),
    );
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v2",
    );
    assert.equal(
      await readFile(join(root, "layout.md"), "utf8"),
      layoutSource
        .replace(shortText, longText)
        .replace(originalCode, revisedCode),
    );
  });
});
