import { useEffect, useRef, useState } from "react";

const BYTE_ORDER_MARK = "\uFEFF";
const HEADING_TAG = /^h[1-6]$/;
const MISSING_HEADING =
  "이 제목의 미리보기 위치를 찾지 못했습니다. 원문에서 위치를 확인해 주세요.";
export type PreviewJump = { offset: number; source: string };
type PreviewNode = {
  tagName?: string;
  position?: { start: { offset?: number } };
  properties?: Record<string, unknown>;
  children?: PreviewNode[];
};

// Markdown's offsets exclude a leading BOM; the editor's UTF-16 offsets include it.
export function previewHeadingPositions() {
  return (tree: PreviewNode, file: { value: unknown }) => {
    const bom =
      typeof file.value === "string" && file.value.startsWith(BYTE_ORDER_MARK)
        ? BYTE_ORDER_MARK.length
        : 0;
    indexHeadings(tree, bom);
  };
}
function indexHeadings(node: PreviewNode, bom: number) {
  const offset = node.position?.start.offset;
  if (
    HEADING_TAG.test(node.tagName ?? "") &&
    Number.isSafeInteger(offset) &&
    offset !== undefined &&
    offset >= 0
  ) {
    node.properties = {
      ...node.properties,
      "data-heading-offset": offset + bom,
      tabIndex: -1,
    };
  }
  for (const child of node.children ?? []) indexHeadings(child, bom);
}
export function movePreviewHeading(root: HTMLElement, offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0) return false;
  const heading = root.querySelector<HTMLElement>(
    `[data-heading-offset="${offset}"]`,
  );
  if (!heading) return false;
  heading.scrollIntoView({ block: "start", inline: "nearest" });
  heading.focus({ preventScroll: true });
  return true;
}
export function usePreviewNavigation(options: {
  jump?: PreviewJump | null;
  handled?: () => void;
  content: string;
}) {
  const root = useRef<HTMLElement>(null);
  const [failedJump, setFailedJump] = useState<PreviewJump | null>(null);
  const { jump, handled, content } = options;
  useEffect(() => {
    if (!jump || !root.current) return;
    const current = jump.source === content;
    setFailedJump(
      current && movePreviewHeading(root.current, jump.offset) ? null : jump,
    );
    handled?.();
  }, [jump, handled, content]);
  useEffect(() => {
    if (!failedJump) return;
    root.current
      ?.querySelector<HTMLElement>(".preview-navigation-notice")
      ?.focus({ preventScroll: true });
  }, [failedJump]);
  return { root, notice: failedJump ? MISSING_HEADING : "" };
}
