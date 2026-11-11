import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { DocumentSummary } from "../generated/DocumentSummary";
import {
  leaveDocumentMenu,
  menuFocusIndex,
  menuPosition,
} from "./menu-behavior";

export type MenuTarget = {
  document: DocumentSummary;
  completed: boolean;
  trigger: HTMLElement;
  x: number;
  y: number;
};
type Props = {
  target: MenuTarget;
  close: (restore: boolean) => void;
  choose: (action: "open" | "complete" | "forget") => void;
};
export function DocumentActionsMenu({ target, close, choose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useMenuPosition(root, target);
  useMenuDismiss(root, close);
  return createPortal(
    <div
      ref={root}
      className="document-actions-menu"
      role="menu"
      aria-label={`${target.document.title} 문서 작업`}
      onKeyDown={(event) => handleMenuKey(event, close, target.trigger)}
    >
      <p>{target.document.title}</p>
      <button type="button" role="menuitem" onClick={() => choose("open")}>
        {target.completed ? "다시 열기" : "문서 열기"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={target.completed ? "danger" : undefined}
        onClick={() => choose(target.completed ? "forget" : "complete")}
      >
        {target.completed ? "목록에서 완전히 제거…" : "완료로 이동"}
      </button>
    </div>,
    document.body,
  );
}
function handleMenuKey(
  event: React.KeyboardEvent<HTMLDivElement>,
  close: Props["close"],
  trigger: HTMLElement,
) {
  if (event.key === "Tab") {
    event.preventDefault();
    leaveDocumentMenu(trigger, event.shiftKey);
    close(false);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    close(true);
    return;
  }
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ),
  ];
  const next = menuFocusIndex(
    event.key,
    items.indexOf(document.activeElement as HTMLButtonElement),
    items.length,
  );
  if (next !== null) {
    event.preventDefault();
    items[next]?.focus();
  }
}

function useMenuPosition(
  root: React.RefObject<HTMLDivElement | null>,
  target: MenuTarget,
) {
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const position = menuPosition(target, node.getBoundingClientRect(), {
      width: innerWidth,
      height: innerHeight,
    });
    Object.assign(node.style, {
      left: `${position.left}px`,
      top: `${position.top}px`,
    });
    node.querySelector<HTMLButtonElement>("button")?.focus();
  }, [root, target]);
}
function useMenuDismiss(
  root: React.RefObject<HTMLDivElement | null>,
  close: Props["close"],
) {
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close(false);
    };
    const resize = () => close(true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", resize);
    };
  }, [root, close]);
}
