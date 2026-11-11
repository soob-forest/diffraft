const EDGE_GAP = 8;
export function menuPosition(
  anchor: { x: number; y: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    left: Math.max(
      EDGE_GAP,
      Math.min(anchor.x, viewport.width - menu.width - EDGE_GAP),
    ),
    top: Math.max(
      EDGE_GAP,
      Math.min(anchor.y, viewport.height - menu.height - EDGE_GAP),
    ),
  };
}
export function menuFocusIndex(key: string, index: number, count: number) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index + count - 1) % count;
  return null;
}
export function focusDocumentTarget(trigger: HTMLElement) {
  requestAnimationFrame(() => {
    if (trigger.isConnected && trigger.getClientRects().length) {
      trigger.focus();
      return;
    }
    const source = document.querySelector<HTMLElement>(
      ".source-editor .cm-content",
    );
    const fallback = document.querySelector<HTMLElement>(
      ".completed-documents > summary",
    );
    const target = source?.getClientRects().length ? source : fallback;
    (target?.getClientRects().length
      ? target
      : document.querySelector<HTMLElement>(
          '.app-header button[aria-controls="document-list"]',
        )
    )?.focus();
  });
}

export function leaveDocumentMenu(trigger: HTMLElement, backwards: boolean) {
  const controls = [
    ...document.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea, summary, [tabindex]",
    ),
  ].filter(
    (node) =>
      node.tabIndex >= 0 &&
      node.getClientRects().length > 0 &&
      !node.matches(":disabled") &&
      !node.closest("[inert], .document-actions-menu"),
  );
  const index = controls.indexOf(trigger);
  const direction = backwards ? -1 : 1;
  const next =
    controls[(index + direction + controls.length) % controls.length];
  (next ?? trigger).focus();
}
