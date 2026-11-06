import { mkdir, readFile, writeFile } from "node:fs/promises";

export const layoutDirectory = ".artifacts/unit-review/after";
export const activeComparison = ".unit-diff-body:not([hidden])";
const geometrySelectors = [
  ".app-header",
  "footer",
  ".document-workspace",
  ".document-toolbar",
  ".document-modebar",
  ".document-main",
  ".unit-review",
  ".unit-core",
  ".unit-review-tools",
  ".unit-progress",
  ".unit-feedback",
  `${activeComparison} .unit-comparison-label`,
  `${activeComparison} .unit-comparison`,
  ".workspace-panel",
  ".unit-comments",
  `${activeComparison} .diff-panes`,
  `${activeComparison} .cm-scroller`,
];

export async function captureUnitLayout(name, context) {
  const geometry = await readUnitGeometry();
  const controls = await readUnitControls(
    ".unit-core select, .unit-actions button",
  );
  const selection = await readSelectedRows();
  const scroll = await readUnitScroll();
  const build = JSON.parse(await readFile(".artifacts/build-e2e.json", "utf8"));
  const actualWindow = await browser.getWindowSize();
  const observation = {
    context,
    actualWindow,
    geometry,
    controls,
    selection,
    scroll,
    build,
  };
  await mkdir(layoutDirectory, { recursive: true });
  await writeFile(
    `${layoutDirectory}/${name}.json`,
    JSON.stringify(observation, null, 2),
  );
  await browser.saveScreenshot(`${layoutDirectory}/${name}.png`);
  return observation;
}

export async function readUnitGeometry() {
  return browser.execute(
    (selectors) => ({
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      visibility: document.visibilityState,
      rects: Object.fromEntries(
        selectors.map((selector) => [
          selector,
          (() => {
            let node = document.querySelector(selector);
            if (
              selector === ".unit-core" &&
              node?.getBoundingClientRect().height === 0
            )
              node = document.querySelector(".unit-review-tools");
            return node?.getBoundingClientRect().toJSON() ?? null;
          })(),
        ]),
      ),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      reviewOverflow: (() => {
        const panel = document.querySelector(".unit-review");
        return panel.scrollWidth > panel.clientWidth + 1;
      })(),
    }),
    geometrySelectors,
  );
}

export async function readUnitControls(selector) {
  return browser.execute(
    (query) =>
      [...document.querySelectorAll(query)]
        .filter(
          (node) =>
            node.getClientRects().length &&
            node.offsetWidth &&
            node.offsetHeight,
        )
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const point = (x, y) =>
            x >= 0 &&
            y >= 0 &&
            x < innerWidth &&
            y < innerHeight &&
            node.contains(document.elementFromPoint(x, y));
          return {
            label: node.getAttribute("aria-label") || node.textContent.trim(),
            tag: node.tagName,
            disabled: node.disabled ?? false,
            rect: rect.toJSON(),
            focused: node === document.activeElement,
            centerHit: point(
              (rect.left + rect.right) / 2,
              (rect.top + rect.bottom) / 2,
            ),
            fullyInViewport:
              rect.left >= 0 &&
              rect.top >= 0 &&
              rect.right <= innerWidth &&
              rect.bottom <= innerHeight,
          };
        }),
    selector,
  );
}

export async function readSelectedRows() {
  return browser.execute(() => {
    const root = document.querySelector(".unit-diff-body:not([hidden])");
    const coreRect = document
      .querySelector(".unit-core")
      .getBoundingClientRect();
    const core = coreRect.height
      ? coreRect
      : document.querySelector(".unit-review-tools").getBoundingClientRect();
    const footer = document.querySelector("footer").getBoundingClientRect();
    const selectedId = document.querySelector(".unit-picker select")?.value;
    const rows = [...root.querySelectorAll(".selected-change")].map((line) => {
      const scroller = line.closest(".cm-scroller").getBoundingClientRect();
      const area = {
        top: Math.max(scroller.top, core.bottom, 0),
        bottom: Math.min(scroller.bottom, footer.top, innerHeight),
        left: Math.max(scroller.left, 0),
        right: Math.min(scroller.right, innerWidth),
      };
      const range = document.createRange();
      range.selectNodeContents(line);
      const text = range.getBoundingClientRect();
      return {
        id: line.dataset.groupId,
        key: line.dataset.sourceKey,
        kind: line.classList.contains("diff-delete") ? "delete" : "insert",
        rect: line.getBoundingClientRect().toJSON(),
        textRect: text.toJSON(),
        area,
        visible:
          text.bottom > area.top &&
          text.top < area.bottom &&
          text.right > area.left &&
          text.left < area.right,
        fullyReadable:
          text.top >= area.top &&
          text.bottom <= area.bottom &&
          text.left >= area.left &&
          text.right <= area.right,
        marker: getComputedStyle(line).boxShadow,
      };
    });
    return {
      selectedId,
      rows,
      offscreenNotice: !!root.querySelector(".unit-offscreen"),
    };
  });
}

export async function readUnitScroll() {
  return browser.execute(() => {
    const root = document.querySelector(".unit-diff-body:not([hidden])");
    const nodes = [...root.querySelectorAll(".cm-scroller")];
    return {
      workspaceTop: document.querySelector(".document-workspace").scrollTop,
      bodyTop: document.scrollingElement.scrollTop,
      scrollers: nodes.map((node) => ({
        top: node.scrollTop,
        height: node.clientHeight,
        extent: node.scrollHeight,
        overflowY: getComputedStyle(node).overflowY,
        firstVisibleKey:
          [...node.querySelectorAll(".cm-line")].find(
            (line) =>
              line.getBoundingClientRect().bottom >
              node.getBoundingClientRect().top,
          )?.dataset.sourceKey ?? "",
      })),
    };
  });
}

export async function focusUnitControl(selector) {
  return browser.execute((query) => {
    const node = document.querySelector(query);
    node.focus({ preventScroll: true });
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      focused: document.activeElement === node,
      hit: node.contains(
        document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        ),
      ),
      rect: rect.toJSON(),
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      shadow: style.boxShadow,
    };
  }, selector);
}
