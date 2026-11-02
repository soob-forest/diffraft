import type { EditorView } from "@codemirror/view";
import type { LogicalSelection, PaneSide } from "./coordinates";
import type { GroupMark } from "./group-selection";
import type { ReviewRow } from "./rows";

export type DiffBookmark = {
  selection: LogicalSelection | null;
  scrollKey: string;
};
export type SelectionPosition = {
  left: number;
  top: number;
  above?: number;
  right?: number;
  side: PaneSide;
  focus?: boolean;
};
export type DiffPaneProps = {
  selectionActionsEnabled?: boolean;
  markers?: Map<string, GroupMark>;
  rows: (ReviewRow | null)[];
  side: PaneSide;
  whitespace: boolean;
  bookmark: React.RefObject<DiffBookmark>;
  onSelection: (value: LogicalSelection | null) => void;
  onSelectionIssue?: (value: string) => void;
  onSelectionPosition?: (position: SelectionPosition | null) => void;
  onEditSelection?: () => void;
  onGroupSelect?: (id: string) => void;
  onExpand: (key: string) => void;
  onMove: (direction: number) => void;
  onScroll: (side: PaneSide, top: number) => void;
  register: (side: PaneSide, view: EditorView | null) => void;
  onMeasure: () => void;
  jump: { selection: LogicalSelection; serial: number } | null;
};
