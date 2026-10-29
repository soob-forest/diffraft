import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./review-fixture.mjs";

export const requestText = "수치는 유지하고 표현을 간결하게 해 주세요.";
export const simpleSource = "# 저장한 문서\n\n한글 😀 저장 확인\n";
export const travelSource = [
  "# 여행 준비 가이드",
  "",
  "## 1. 출발 준비",
  "준비를 마치면 동행인에게 알립니다.",
  "출발 시간과 이동 경로를 함께 기록합니다.",
  "",
  "## 2. 확인 시간",
  "출발 전 10분 동안 준비물을 확인합니다.",
  "준비가 늦어지면 진행 상황을 공유합니다.",
  "",
  "## 3. 여행 기록",
  "필요하면 다음 준비 사항을 정리합니다.",
  "",
].join("\n");

export async function openFixture(name, source, versions) {
  await writeFile(join(root, `${name}.md`), source);
  await writeFile(join(root, "next-pick"), name);
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const document = snapshot.documents.find((item) => item.title === name);
  for (let version = 1; version < versions; version++)
    await editor({
      kind: "save",
      documentId: document.id,
      expectedVersion: version,
      content: source,
      operationId: crypto.randomUUID(),
    });
  const task = await editor({
    kind: "put_task",
    task: {
      id: crypto.randomUUID(),
      documentId: document.id,
      goal: "사실과 수치 유지",
      pinnedRules: "수치 유지 · 한국어로 간결하게",
      summary: "",
    },
  });
  await editor({
    kind: "select_task",
    documentId: document.id,
    taskId: task.id,
  });
  await refresh(name);
  return { document, task, source, versions };
}

async function refresh(name) {
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".sidebar").$(`button=${name}`).click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === name,
  );
  await $(".request-form textarea").waitForExist();
}

export async function registerReview(fixture) {
  const scope = await editor({
    kind: "scope",
    documentId: fixture.document.id,
    expectedVersion: fixture.versions,
    selection: { kind: "whole" },
  });
  const replacements = [
    [
      "준비를 마치면 동행인에게 알립니다.",
      "준비 확인이 끝나면 동행인에게 바로 알립니다.",
      "문장 표현 개선",
    ],
    [
      "출발 전 10분 동안 준비물을 확인합니다.",
      "출발 전 5분 동안 준비물을 확인합니다.",
      "확인 시간 단축",
    ],
    [
      "필요하면 다음 준비 사항을 정리합니다.",
      "다음 준비 사항이 있으면 정리합니다.",
      "준비 사항 명확화",
    ],
  ];
  const changes = replacements.map(([beforeText, afterText, reason]) => {
    const block = scope.blocks.find((item) => item.text.includes(beforeText));
    assert.ok(block);
    return { block_id: block.id, before: beforeText, after: afterText, reason };
  });
  await invoke("e2e_register_ai", {
    documentId: fixture.document.id,
    taskId: fixture.task.id,
    responseJson: JSON.stringify({
      schema_version: 1,
      mode: "PATCH",
      summary: "여행 준비 개선",
      changes,
    }),
  });
  await $("button=변경 검토").click();
  await $('[data-testid="diff-inline"]').waitForDisplayed();
}

export async function resizeContent(width, height) {
  await browser.execute(
    async (width, height) => {
      const current = window.__TAURI__.window.getCurrentWindow();
      let requestedWidth = width,
        requestedHeight = height;
      for (let attempt = 0; attempt < 3; attempt++) {
        await current.setSize(
          new window.__TAURI__.dpi.LogicalSize(requestedWidth, requestedHeight),
        );
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        if (innerWidth === width && innerHeight === height) return;
        requestedWidth += width - innerWidth;
        requestedHeight += height - innerHeight;
      }
      throw new Error(
        `Expected ${width}x${height}; actual ${innerWidth}x${innerHeight}`,
      );
    },
    width,
    height,
  );
  await browser.waitUntil(async () =>
    browser.execute(
      (width, height) => innerWidth === width && innerHeight === height,
      width,
      height,
    ),
  );
  if (
    width > 1000 &&
    (await $("button=문서 목록").isExisting()) &&
    (await $("button=문서 목록").getAttribute("aria-expanded")) === "false"
  )
    await $("button=문서 목록").click();
}

export async function captureScene(scene) {
  const phase = process.env.DOCREVIEW_TOBE_CAPTURE || "after";
  assert.ok(["before", "after"].includes(phase));
  const directory = `.artifacts/tobe/${phase}`;
  await mkdir(directory, { recursive: true });
  await browser.execute(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const metadata = await browser.execute(() => {
    const selectors = [
      ".app-header",
      ".sidebar",
      ".document-toolbar",
      ".document-modebar",
      ".workspace-panel",
      ".review-tools",
      ".connection-dialog",
      ".scope-bar",
      ".task-condition-details",
      ".source-editor .cm-gutters",
      ".diff-pane .cm-gutters",
      ".diff-panes",
      ".diff-pane .cm-line",
      ".comment-form textarea",
      ".request-form textarea",
      "footer",
    ];
    return {
      viewport: [innerWidth, innerHeight],
      reading: Object.fromEntries(
        [
          ".source-editor .cm-line",
          ".diff-delete",
          ".diff-equal",
          ".change-group-start",
        ].map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return [selector, null];
          const node = document
            .createTreeWalker(element, NodeFilter.SHOW_TEXT)
            .nextNode();
          if (!node) return [selector, null];
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, Math.min(1, node.textContent.length));
          const rect = range.getBoundingClientRect();
          return [
            selector,
            {
              x: rect.x,
              y: rect.y,
              headerX:
                element.getBoundingClientRect().x +
                parseFloat(
                  getComputedStyle(element, "::before").marginLeft || "0",
                ),
            },
          ];
        }),
      ),
      panelScroll: (() => {
        const panel = document.querySelector(".workspace-panel");
        return {
          clientWidth: panel.clientWidth,
          scrollWidth: panel.scrollWidth,
          clientHeight: panel.clientHeight,
          scrollHeight: panel.scrollHeight,
          children: [
            ...panel.querySelectorAll(
              ".task-panel > *, .generation-panel > *, .conversation > *",
            ),
          ].map((element) => ({
            tag: element.tagName,
            class: element.className,
            text: element.textContent.slice(0, 100),
            top: element.getBoundingClientRect().top,
            bottom: element.getBoundingClientRect().bottom,
          })),
        };
      })(),
      capturedAt: new Date().toISOString(),
      elements: selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, missing: true };
        const rect = element.getBoundingClientRect(),
          style = getComputedStyle(element);
        return {
          selector,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          font: style.fontSize,
          lineHeight: style.lineHeight,
          background: style.backgroundColor,
        };
      }),
    };
  });
  await writeFile(
    `${directory}/${scene}.json`,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  await browser.saveScreenshot(`${directory}/${scene}.png`);
}

export async function assertSource(fixture, name) {
  assert.equal(
    await readFile(join(root, `${name}.md`), "utf8"),
    fixture.source,
  );
}
