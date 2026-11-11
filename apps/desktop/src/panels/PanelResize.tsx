import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clampSize,
  keyboardSize,
  PANEL_DEFAULTS,
  type PanelKind,
  panelLimits,
} from "./panel-size";

type Props = {
  kind: PanelKind;
  controls: string;
  value: number;
  onChange: (value: number) => void;
};
type Drag = { pointer: number; x: number; width: number };
export function usePanelWidth(kind: PanelKind) {
  return useState<number>(PANEL_DEFAULTS[kind]);
}

export function PanelResize(props: Props) {
  const { limits, measure, direction } = useResizeLimits(props.kind);
  const pointer = useResizeDrag({ ...props, limits, measure, direction });
  const accessibleLabel =
    props.kind === "documents"
      ? "문서 목록 너비 조절"
      : "AI 요청·변경 상세 너비 조절";
  return (
    <hr
      className={`panel-resize panel-resize-${props.kind}`}
      tabIndex={0}
      aria-label={accessibleLabel}
      aria-orientation="vertical"
      aria-controls={props.controls}
      aria-valuemin={Math.round(limits.minimum)}
      aria-valuemax={Math.round(limits.maximum)}
      aria-valuenow={clampSize(props.value, limits.minimum, limits.maximum)}
      title={`${accessibleLabel} · 드래그 또는 좌우 방향키 · 두 번 클릭하면 기본 너비`}
      onFocus={(event) => measure(event.currentTarget)}
      onDoubleClick={() => props.onChange(PANEL_DEFAULTS[props.kind])}
      onKeyDown={(event) =>
        resizeByKey(event, {
          ...props,
          limits: measure(event.currentTarget),
          direction,
        })
      }
      {...pointer}
    />
  );
}

type ResizeOptions = Props & {
  limits: ReturnType<typeof panelLimits>;
  direction: number;
  measure: (element: HTMLElement) => ReturnType<typeof panelLimits>;
};
function useResizeLimits(kind: PanelKind) {
  const [limits, setLimits] = useState(panelLimits(kind, window.innerWidth));
  const measure = (element: HTMLElement) => {
    const container = element.closest(
      kind === "documents" ? ".app-shell" : ".document-workspace",
    );
    const next = panelLimits(kind, container?.clientWidth ?? window.innerWidth);
    setLimits(next);
    return next;
  };
  return { limits, measure, direction: kind === "documents" ? 1 : -1 };
}
function resizeByKey(
  event: KeyboardEvent,
  options: Omit<ResizeOptions, "measure">,
) {
  const current =
    event.currentTarget.parentElement?.clientWidth ?? options.value;
  const key =
    options.direction === -1 && event.key.startsWith("Arrow")
      ? event.key === "ArrowLeft"
        ? "ArrowRight"
        : event.key === "ArrowRight"
          ? "ArrowLeft"
          : event.key
      : event.key;
  const value = keyboardSize(key, current, options.limits);
  if (value === null) return;
  event.preventDefault();
  options.onChange(
    clampSize(value, options.limits.minimum, options.limits.maximum),
  );
}
function useResizeDrag(options: ResizeOptions) {
  const drag = useRef<
    (Drag & { limits: ResizeOptions["limits"]; direction: number }) | null
  >(null);
  useDragEvents(drag, options.onChange);
  return {
    onPointerDown: (event: PointerEvent<HTMLHRElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        width:
          event.currentTarget.parentElement?.getBoundingClientRect().width ??
          options.value,
        limits: options.measure(event.currentTarget),
        direction: options.direction,
      };
    },
  };
}
function useDragEvents(
  drag: React.RefObject<
    (Drag & { limits: ResizeOptions["limits"]; direction: number }) | null
  >,
  onChange: Props["onChange"],
) {
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      onChange(
        clampSize(
          start.width + (event.clientX - start.x) * start.direction,
          start.limits.minimum,
          start.limits.maximum,
        ),
      );
    };
    const end = () => {
      drag.current = null;
    };
    const cancel = () => {
      if (drag.current) onChange(drag.current.width);
      end();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", end);
    return () => {
      end();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", end);
    };
  }, [drag, onChange]);
}
