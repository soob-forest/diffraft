import { useEffect } from "react";

const REPEATED_CLICK_MS = 500;
const REPEATED_CLICK_DISTANCE = 4;
type Pointer = { timeStamp: number; clientX: number; clientY: number };

export function repeatedDecisionPointer(
  previous: Pointer | null,
  next: Pointer,
) {
  return (
    !!previous &&
    next.timeStamp - previous.timeStamp < REPEATED_CLICK_MS &&
    Math.abs(next.clientX - previous.clientX) <= REPEATED_CLICK_DISTANCE &&
    Math.abs(next.clientY - previous.clientY) <= REPEATED_CLICK_DISTANCE
  );
}

export function useDecisionPointerGuard() {
  useEffect(() => {
    let previous: Pointer | null = null;
    let blockedClick = false;
    const down = (event: MouseEvent) => {
      blockedClick = repeatedDecisionPointer(previous, event);
      if (blockedClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      previous =
        event.target instanceof Element &&
        event.target.closest(".unit-decision")
          ? {
              timeStamp: event.timeStamp,
              clientX: event.clientX,
              clientY: event.clientY,
            }
          : null;
    };
    const click = (event: MouseEvent) => {
      if (!blockedClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
}
