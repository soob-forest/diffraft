export async function readGroupedTitle() {
  return browser.execute(() => {
    const title = document.querySelector(".unit-information h4");
    const popup = title.closest(".unit-options-popup");
    const rect = title.getBoundingClientRect(),
      bounds = popup.getBoundingClientRect();
    return {
      text: title.textContent.trim(),
      rect: rect.toJSON(),
      popup: bounds.toJSON(),
      fullyVisible:
        rect.top >= bounds.top &&
        rect.bottom <= bounds.bottom &&
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        rect.bottom <= innerHeight &&
        rect.top >= 0,
      clipped: title.scrollWidth > title.clientWidth + 1,
      hit: title.contains(
        document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        ),
      ),
    };
  });
}

export async function readRangeMarkers() {
  return browser.execute(() => {
    const root = document.querySelector(".unit-diff-body:not([hidden])");
    return [
      ...root.querySelectorAll(".selected-change.change-group-start"),
    ].map((line) => {
      const rect = line.getBoundingClientRect(),
        scroller = line.closest(".cm-scroller").getBoundingClientRect();
      const coreRect = document
        .querySelector(".unit-core")
        .getBoundingClientRect();
      const core = coreRect.height
        ? coreRect
        : document.querySelector(".unit-review-tools").getBoundingClientRect();
      const heading = getComputedStyle(line, "::before");
      return {
        id: line.dataset.groupId,
        key: line.dataset.sourceKey,
        title: line.dataset.groupTitle,
        content: heading.content,
        marker: getComputedStyle(line).boxShadow,
        visible:
          rect.top + parseFloat(heading.height) >
            Math.max(scroller.top, core.bottom, 0) &&
          rect.top < Math.min(scroller.bottom, innerHeight),
        rect: rect.toJSON(),
      };
    });
  });
}

export async function readGroupedWrapping() {
  return browser.execute(() =>
    [
      ...document.querySelectorAll(".unit-diff-body:not([hidden]) .cm-content"),
    ].map((content) => {
      const scroller = content.closest(".cm-scroller");
      const bounds = scroller.getBoundingClientRect();
      return {
        content: content.getBoundingClientRect().toJSON(),
        scroller: bounds.toJSON(),
        minimum: getComputedStyle(content).minWidth,
        extent: scroller.scrollWidth,
        width: scroller.clientWidth,
      };
    }),
  );
}
