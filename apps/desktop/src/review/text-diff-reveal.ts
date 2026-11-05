import { useLayoutEffect, useRef } from "react";
import type { TextRowReveal } from "./text-diff-navigation";

const READING_MARGIN_PX = 8;

export function useTextDiffReveal(
  request: TextRowReveal | null | undefined,
  active: boolean | undefined,
) {
  const rows = useRef<HTMLOListElement>(null);
  const handled = useRef<TextRowReveal | null>(null);
  useLayoutEffect(() => {
    if (!request || active === false || !rows.current) return;
    const reveal = () => {
      handled.current = revealTextDiffRequest(
        rows.current,
        request,
        active,
        handled.current,
      );
    };
    reveal();
    if (handled.current === request) return;
    const resize = new ResizeObserver(reveal);
    resize.observe(rows.current);
    return () => resize.disconnect();
  }, [request, active]);
  return rows;
}

export function revealTextDiffRequest(
  list: HTMLOListElement | null,
  request: TextRowReveal | null | undefined,
  active: boolean | undefined,
  handled: TextRowReveal | null,
) {
  if (!list || !request || active === false || handled === request)
    return handled;
  return revealTextDiffRow(list, request.rowKey) ? request : handled;
}

export function revealTextDiffRow(list: HTMLOListElement, rowKey: string) {
  const scroller = list.closest<HTMLDetailsElement>(".text-diff");
  const row = Array.from(list.children).find(
    (child) => (child as HTMLElement).dataset.rowKey === rowKey,
  );
  if (!scroller || !row?.getClientRects().length) return false;
  const bounds = scroller.getBoundingClientRect();
  if (bounds.height <= 0) return false;
  const summary = scroller.querySelector("summary")?.getBoundingClientRect();
  const top =
    Math.max(bounds.top, summary?.bottom ?? bounds.top) + READING_MARGIN_PX;
  const bottom = bounds.bottom - READING_MARGIN_PX;
  const target = row.getBoundingClientRect();
  if (target.top < top || target.height > bottom - top)
    scroller.scrollTop += target.top - top;
  else if (target.bottom > bottom) scroller.scrollTop += target.bottom - bottom;
  return true;
}
