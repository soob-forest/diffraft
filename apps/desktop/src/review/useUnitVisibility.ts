import { useEffect, useRef, useState } from "react";

type Rect = { top: number; bottom: number; left: number; right: number };
export function intersectsReadingArea(range: Rect, area: Rect) {
  if (area.top >= area.bottom || area.left >= area.right) return false;
  return (
    range.bottom > area.top &&
    range.top < area.bottom &&
    range.right > area.left &&
    range.left < area.right
  );
}

export function useUnitVisibility(
  id: string | undefined,
  active: boolean,
  hasRanges: boolean,
) {
  const root = useRef<HTMLDivElement>(null);
  const [visibility, setVisibility] = useState({ id, offscreen: false });
  useEffect(() => {
    const element = root.current;
    if (!element || !active || !id || !hasRanges) return;
    return observeVisibility(element, id, (offscreen) =>
      setVisibility((current) =>
        current.id === id && current.offscreen === offscreen
          ? current
          : { id, offscreen },
      ),
    );
  }, [id, active, hasRanges]);
  return {
    root,
    offscreen:
      active && hasRanges && visibility.id === id && visibility.offscreen,
  };
}
function observeVisibility(
  root: HTMLElement,
  id: string,
  report: (value: boolean) => void,
) {
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() =>
      report(
        root.querySelector(".text-diff[open]")
          ? false
          : !selectedRangeVisible(root, id),
      ),
    );
  };
  const resize = new ResizeObserver(measure);
  const mutations = new MutationObserver(measure);
  resize.observe(root);
  mutations.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-group-id", "open"],
  });
  root.addEventListener("scroll", measure, true);
  window.addEventListener("scroll", measure, true);
  window.addEventListener("resize", measure);
  measure();
  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    root.removeEventListener("scroll", measure, true);
    window.removeEventListener("scroll", measure, true);
    window.removeEventListener("resize", measure);
  };
}
function selectedRangeVisible(root: HTMLElement, id: string) {
  const workspace = root
    .closest(".document-workspace")
    ?.getBoundingClientRect();
  const coreRect = root
    .closest(".unit-review")
    ?.querySelector(".unit-core")
    ?.getBoundingClientRect();
  const core = coreRect?.height
    ? coreRect
    : root
        .closest(".unit-review")
        ?.querySelector(".unit-review-tools")
        ?.getBoundingClientRect();
  return [...root.querySelectorAll<HTMLElement>("[data-group-id]")].some(
    (line) => {
      if (line.dataset.groupId !== id) return false;
      const scroller = line.closest(".cm-scroller")?.getBoundingClientRect();
      if (!scroller) return false;
      return intersectsReadingArea(changedTextRect(line), {
        top: Math.max(scroller.top, core?.bottom ?? 0, workspace?.top ?? 0, 0),
        bottom: Math.min(
          scroller.bottom,
          workspace?.bottom ?? innerHeight,
          innerHeight,
        ),
        left: Math.max(scroller.left, workspace?.left ?? 0, 0),
        right: Math.min(
          scroller.right,
          workspace?.right ?? innerWidth,
          innerWidth,
        ),
      });
    },
  );
}
function changedTextRect(line: HTMLElement): Rect {
  const range = document.createRange();
  range.selectNodeContents(line);
  const text = range.getBoundingClientRect();
  if (text.height && text.width) return text;
  const rect = line.getBoundingClientRect();
  const heading =
    Number.parseFloat(getComputedStyle(line, "::before").height) || 0;
  return {
    top: rect.top + heading,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
  };
}
