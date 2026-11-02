import { type ReactNode, useState } from "react";
import type { DiffStats } from "../generated/DiffStats";
import { comparisonJump } from "./comparison-navigation";
import type { LogicalSelection } from "./coordinates";
import { DiffViewer } from "./DiffViewer";
import type { DiffComparison } from "./rows";

type Props = {
  active?: boolean;
  comparison: DiffComparison & { stats: DiffStats };
  header?: ReactNode;
  labels?: [string, string];
  selection?: {
    onSelection: (value: LogicalSelection | null) => void;
    onSelectionIssue: (value: string) => void;
    onEditSelection: () => void;
    tools: ReactNode;
  };
};
export function ComparisonViewer({
  active,
  comparison,
  header,
  labels,
  selection,
}: Props) {
  const { move, jump } = useComparisonNavigation(comparison);
  return (
    <DiffViewer
      active={active}
      projection={comparison}
      labels={labels}
      onMove={move}
      onSelection={selection?.onSelection ?? (() => {})}
      onSelectionIssue={selection?.onSelectionIssue}
      onEditSelection={selection?.onEditSelection}
      selectionTools={selection?.tools}
      jump={jump}
      tools={{
        header: (
          <>
            {header}
            <strong data-testid="comparison-stats">
              +{comparison.stats.addedLines} / −{comparison.stats.removedLines}
            </strong>
            <button
              type="button"
              disabled={!comparison.hunks.length}
              onClick={() => move(-1)}
            >
              이전 차이
            </button>
            <button
              type="button"
              disabled={!comparison.hunks.length}
              onClick={() => move(1)}
            >
              다음 차이
            </button>
          </>
        ),
        selection: selection?.tools,
      }}
    />
  );
}

function useComparisonNavigation(comparison: DiffComparison) {
  const [position, setPosition] = useState(-1);
  const [jump, setJump] = useState<{
    selection: LogicalSelection;
    serial: number;
  } | null>(null);
  const move = (direction: number) => {
    const target = comparisonJump(comparison, position, direction);
    if (!target) return;
    setPosition(target.position);
    setJump((last) => ({
      serial: (last?.serial ?? 0) + 1,
      selection: target.selection,
    }));
  };
  return { move, jump };
}
