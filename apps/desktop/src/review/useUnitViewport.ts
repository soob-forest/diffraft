import { useLayoutEffect, useRef } from "react";

const SHORT_WINDOW_HEIGHT = 700;

// The document header may scroll away on short windows; the review keeps its own height.
export function useUnitViewport(active: boolean, attention = false) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active || !attention) return;
    const frame = requestAnimationFrame(() => revealReview(root.current, true));
    return () => cancelAnimationFrame(frame);
  }, [active, attention]);
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => revealReview(root.current));
    };
    reveal();
    const resize = new ResizeObserver(reveal);
    if (root.current) resize.observe(root.current);
    const workspace = root.current?.closest(".document-workspace");
    workspace?.addEventListener("focusin", reveal);
    window.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      workspace?.removeEventListener("focusin", reveal);
      window.removeEventListener("resize", reveal);
    };
  }, [active]);
  return root;
}
function revealReview(element: HTMLElement | null, important = false) {
  if (!element || innerHeight > SHORT_WINDOW_HEIGHT) return;
  const focused = document.activeElement;
  const panel = element
    .closest(".document-workspace")
    ?.querySelector<HTMLElement>(".workspace-panel:not([hidden])");
  if (panel?.contains(focused) && panel.getClientRects().length) {
    alignWorkspace(panel);
    return;
  }
  if (!element.getClientRects().length) return;
  if (
    !important &&
    focused &&
    focused !== document.body &&
    !element.contains(focused)
  )
    return;
  alignWorkspace(element);
}
function alignWorkspace(target: HTMLElement) {
  const workspace = target.closest<HTMLElement>(".document-workspace");
  if (!workspace) return;
  workspace.scrollTop +=
    target.getBoundingClientRect().top - workspace.getBoundingClientRect().top;
}
