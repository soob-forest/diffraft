import assert from "node:assert/strict";

export async function assertTobeFrame() {
  const geometry = await browser.execute(() => {
    const rect = (selector) =>
      document.querySelector(selector).getBoundingClientRect();
    const history = rect(".version-history"),
      panel = rect(".workspace-panel");
    return {
      viewport: [innerWidth, innerHeight],
      sidebar: rect(".sidebar").width,
      panelTop: panel.top,
      panelWidth: panel.width,
      historyBottom: Math.round(history.bottom),
      footerTop: rect("footer").top,
      sidebarButtonBorder: getComputedStyle(
        document.querySelector(".document-actions button"),
      ).borderTopColor,
    };
  });
  assert.deepEqual(geometry, {
    viewport: [1440, 900],
    sidebar: 196,
    panelTop: 50,
    panelWidth: 360,
    historyBottom: 868,
    footerTop: 868,
    sidebarButtonBorder: "rgba(0, 0, 0, 0)",
  });
}

export async function assertRequestFlow() {
  const layout = await browser.execute(() => {
    const panel = document.querySelector(".task-panel");
    const input = panel.querySelector(".request-form textarea");
    const button = panel.querySelector('.request-form button[type="submit"]');
    return {
      heading: panel.querySelector("h2").textContent,
      taskPicker: Boolean(panel.querySelector(".task-picker")),
      typeButtons: panel.querySelectorAll(".request-kind button").length,
      inputFont: getComputedStyle(input).fontSize,
      buttonWidth: Math.round(button.getBoundingClientRect().width),
    };
  });
  assert.deepEqual(layout, {
    heading: "현재 작업",
    taskPicker: true,
    typeButtons: 2,
    inputFont: "16px",
    buttonWidth: 311,
  });
}

export async function assertReviewFlow() {
  const result = await browser.execute(() => {
    const top = (selector) =>
      document.querySelector(selector).getBoundingClientRect().top;
    return {
      order:
        top(".review-primary-tools") < top(".group-bar") &&
        top(".group-bar") < top(".diff-toolbar"),
      heading: document.querySelector(".proposal-details h3").textContent,
      paneTop: document.querySelector(".diff-panes").getBoundingClientRect()
        .top,
      paneHeight: document.querySelector(".diff-panes").getBoundingClientRect()
        .height,
      quoteFont: getComputedStyle(
        document.querySelector(".proposal-details blockquote"),
      ).fontSize,
    };
  });
  assert.ok(Math.abs(result.paneTop - 377.46875) <= 2, JSON.stringify(result));
  assert.ok(
    Math.abs(result.paneHeight - 444.09375) <= 2,
    JSON.stringify(result),
  );
  const flow = {
    order: result.order,
    heading: result.heading,
    quoteFont: result.quoteFont,
  };
  assert.deepEqual(flow, {
    order: true,
    heading: "선택한 변경",
    quoteFont: "16px",
  });
}

export async function assertCommentFlow() {
  const layout = await browser.execute(() => {
    const form = document.querySelector(".comment-form:not([hidden])");
    const input = form.querySelector("textarea"),
      save = form.querySelector('button[type="submit"]');
    const panel = form.closest(".workspace-panel").getBoundingClientRect();
    return {
      heading: form.querySelector("h3").textContent,
      inputFont: getComputedStyle(input).fontSize,
      visible:
        input.getBoundingClientRect().top >= panel.top &&
        save.getBoundingClientRect().bottom <= panel.bottom,
      compact: Boolean(document.querySelector(".comment-selection")),
    };
  });
  assert.deepEqual(layout, {
    heading: "선택한 변경에 코멘트",
    inputFont: "16px",
    visible: true,
    compact: true,
  });
}

export async function assertNarrowFlow() {
  const result = await browser.execute(() => {
    const main = document.querySelector(".document-main"),
      panel = document.querySelector(".workspace-panel");
    return {
      viewport: [innerWidth, innerHeight],
      mainVisible: main.getBoundingClientRect().width > 0,
      panelWidth: panel.getBoundingClientRect().width,
      inputWidth: document
        .querySelector(".request-form textarea")
        .getBoundingClientRect().width,
      sourceFont: getComputedStyle(
        document.querySelector(".source-editor .cm-scroller"),
      ).fontSize,
    };
  });
  assert.deepEqual(result, {
    viewport: [800, 600],
    mainVisible: true,
    panelWidth: 290,
    inputWidth: 257,
    sourceFont: "16px",
  });
}

export async function assertConnectionFlow() {
  const result = await browser.execute(() => {
    const dialog = document.querySelector(".connection-dialog");
    const close = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "설정 닫기",
    );
    return {
      width: dialog.getBoundingClientRect().width,
      padding: getComputedStyle(dialog).padding,
      primary: getComputedStyle(close).backgroundColor,
      diagnosticsClosed: !dialog.querySelector(".connection-diagnostics").open,
    };
  });
  assert.deepEqual(result, {
    width: 650,
    padding: "32px",
    primary: "rgb(41, 87, 200)",
    diagnosticsClosed: true,
  });
}
