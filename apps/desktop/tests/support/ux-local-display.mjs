import { mkdir, writeFile } from "node:fs/promises";
import {
  foregroundUnitDisplay,
  readUnitDisplayState,
  settleUnitDisplay,
} from "./unit-review-display.mjs";

export async function prepareUxLocalDisplay() {
  await mkdir(".artifacts/ux", { recursive: true });
  await foregroundUnitDisplay(1);
  return settleUnitDisplay();
}

export async function recordUxLocalFailure(test) {
  if (test.state !== "failed") return;
  const index = test.parent.tests.indexOf(test);
  const snapshots = await Promise.allSettled([
    readUnitDisplayState(),
    readLocalUi(),
    readLocalSelection(),
  ]);
  const metadata = JSON.stringify(
    {
      step: test.title,
      snapshots: Object.fromEntries(
        snapshots.map((result, position) => [
          ["display", "ui", "selection"][position],
          result.status === "fulfilled"
            ? result.value
            : { error: String(result.reason) },
        ]),
      ),
    },
    null,
    2,
  );
  await writeFile(`.artifacts/ux/local-failure-${index}.json`, metadata);
  await writeFile(".artifacts/ux/local-failure.json", metadata);
  await browser.saveScreenshot(`.artifacts/ux/local-failure-${index}.png`);
  await browser.saveScreenshot(".artifacts/ux/local-failure.png");
}

async function readLocalUi() {
  return browser.execute(() => ({
    title: document.querySelector(".document-toolbar h1")?.textContent,
    errors: [
      ...document.querySelectorAll(
        "[role=alert],.generation-panel > [role=status],.workspace-body>.error-banner",
      ),
    ].map((node) => node.textContent),
    focus: {
      tag: document.activeElement?.tagName,
      classes: document.activeElement?.className,
      testId: document.activeElement?.getAttribute("data-testid"),
    },
    popovers: [...document.querySelectorAll(".selection-context")].map(
      (node) => ({
        visible: !!node.getClientRects().length,
        containsFocus: node.contains(document.activeElement),
      }),
    ),
    scrolls: [...document.querySelectorAll(".diff-pane .cm-scroller")].map(
      (node) => ({
        top: node.scrollTop,
        height: node.clientHeight,
        content: node.scrollHeight,
      }),
    ),
  }));
}

async function readLocalSelection() {
  return browser.execute(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode?.parentElement;
    const focus = selection?.focusNode?.parentElement;
    const rect = selection?.rangeCount
      ? selection.getRangeAt(0).getBoundingClientRect()
      : null;
    return {
      collapsed: selection?.isCollapsed,
      length: selection?.toString().length,
      anchorOffset: selection?.anchorOffset,
      focusOffset: selection?.focusOffset,
      anchorPane: anchor?.closest(".cm-content")?.getAttribute("data-testid"),
      focusPane: focus?.closest(".cm-content")?.getAttribute("data-testid"),
      rect: rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
    };
  });
}
