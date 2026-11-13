import { useEffect, useLayoutEffect, useRef } from "react";
import { menuPosition } from "../documents/menu-behavior";
import { NavigationHost, useNavigationVisibility } from "./NavigationSlots";

export function DocumentNavigation() {
  const root = useRef<HTMLDetailsElement>(null);
  const { open, setOpen } = useNavigationVisibility();
  useNavigationDismiss(root);
  useLayoutEffect(() => {
    setOpen?.(root.current?.open ?? false);
  }, [setOpen]);
  useLayoutEffect(() => {
    if (open && root.current) positionNavigation(root.current);
  }, [open]);
  return (
    <details
      ref={root}
      className="document-navigation navigation-more"
      onToggle={(event) => {
        if (event.target === event.currentTarget)
          setOpen?.(event.currentTarget.open);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary>문서 탐색</summary>
      <div className="navigation-popover">
        <NavigationHost />
      </div>
    </details>
  );
}
function positionNavigation(node: HTMLDetailsElement) {
  const summary = node.querySelector("summary");
  const popup = node.querySelector<HTMLElement>(".navigation-popover");
  if (!node.open || !summary || !popup) return;
  const bounds = summary.getBoundingClientRect();
  const position = menuPosition(
    { x: bounds.left, y: bounds.bottom + 4 },
    popup.getBoundingClientRect(),
    { width: innerWidth, height: innerHeight },
  );
  Object.assign(popup.style, {
    left: `${position.left}px`,
    top: `${position.top}px`,
  });
}
function useNavigationDismiss(
  root: React.RefObject<HTMLDetailsElement | null>,
) {
  useEffect(() => {
    const close = (event: Event) => {
      const node = root.current;
      if (
        node?.open &&
        event.target instanceof Node &&
        !node.contains(event.target)
      )
        node.open = false;
    };
    const resize = () => {
      if (root.current) root.current.open = false;
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("focusin", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("focusin", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", resize);
    };
  }, [root]);
}
