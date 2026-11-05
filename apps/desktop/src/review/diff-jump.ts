import { EditorView } from "@codemirror/view";

// Include the 42.4px group heading and the default cursor margin.
const GROUP_HEADING_CONTEXT_PX = 48;

export function diffJumpScroll(
  jump: { revealGroupHeading?: boolean },
  position: number,
) {
  if (!jump.revealGroupHeading) return { scrollIntoView: true, effects: [] };
  return {
    scrollIntoView: false,
    effects: EditorView.scrollIntoView(position, {
      y: "start",
      yMargin: GROUP_HEADING_CONTEXT_PX,
    }),
  };
}
