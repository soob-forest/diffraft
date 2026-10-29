import { useLayoutEffect, useRef, useState } from "react";

type Props = { text: string; label?: string; focusOffset?: number };
export function QuotePreview({ text, label, focusOffset = 0 }: Props) {
  const content = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      setOverflowing(
        Boolean(text) && element.scrollHeight > element.clientHeight + 1,
      );
      scrollToFocus(element, focusOffset, expanded);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, focusOffset, expanded]);
  return (
    <div className="quote-preview">
      {focusOffset > 0 && !expanded && (
        <small className="quote-context-note">
          전체 인용 중 변경 위치 미리보기
        </small>
      )}
      <blockquote aria-label={label}>
        <span ref={content} className="quote-text" data-expanded={expanded}>
          {text}
        </span>
      </blockquote>
      {(overflowing || expanded) && (
        <button
          type="button"
          className="quote-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "인용 접기" : "인용 전문 보기"}
        </button>
      )}
    </div>
  );
}

function scrollToFocus(
  element: HTMLSpanElement,
  offset: number,
  expanded: boolean,
) {
  element.scrollTop = 0;
  const node = element.firstChild;
  if (
    expanded ||
    !node ||
    !Number.isInteger(offset) ||
    offset <= 0 ||
    offset >= (node.textContent?.length ?? 0)
  )
    return;
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  element.scrollTop = Math.max(
    0,
    range.getBoundingClientRect().top - element.getBoundingClientRect().top,
  );
}
