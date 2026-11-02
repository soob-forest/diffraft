import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
export type PopoverPosition = {
  left: number;
  top: number;
  above?: number;
  focus?: boolean;
  right?: number;
};
export function popoverPlacement(
  position: PopoverPosition,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8;
  const below = position.top + margin;
  const top =
    below + size.height <= viewport.height - margin
      ? below
      : (position.above ?? position.top) - size.height - margin;
  return {
    left: Math.max(
      margin,
      Math.min(
        position.left,
        Math.min(position.right ?? viewport.width, viewport.width) -
          size.width -
          margin,
      ),
    ),
    top: Math.max(
      margin,
      Math.min(top, viewport.height - size.height - margin),
    ),
  };
}
export function SelectionPopover({
  position,
  close,
  children,
}: {
  position: PopoverPosition;
  close: (restoreFocus?: boolean) => void;
  children: ReactNode;
}) {
  const { root, size } = usePopoverGeometry(position);
  usePopoverDismissal(root, close);
  return (
    <fieldset
      ref={root}
      className="selection-context"
      aria-label="선택한 부분의 행동"
      style={popoverPlacement(position, size, {
        width: innerWidth,
        height: innerHeight,
      })}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "button:not([data-keep-popover])",
          )
        )
          close(false);
      }}
    >
      {children}
    </fieldset>
  );
}

function usePopoverGeometry(position: PopoverPosition) {
  const root = useRef<HTMLFieldSetElement>(null);
  const [size, setSize] = useState({ width: 280, height: 64 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () =>
      setSize({ width: element.offsetWidth, height: element.offsetHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    if (position.focus)
      element.querySelector("button")?.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [position]);
  return { root, size };
}
function usePopoverDismissal(
  root: React.RefObject<HTMLFieldSetElement | null>,
  close: (restoreFocus?: boolean) => void,
) {
  useEffect(() => {
    const dismiss = (event: Event) => {
      const element = root.current;
      if (
        !element ||
        (event.target instanceof Node && element.contains(event.target))
      )
        return;
      close(element.contains(document.activeElement));
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [root, close]);
}
