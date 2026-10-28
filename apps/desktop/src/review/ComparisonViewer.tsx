import { useState } from "react";
import type { DiffStats } from "../generated/DiffStats";
import { comparisonJump } from "./comparison-navigation";
import type { LogicalSelection } from "./coordinates";
import { DiffViewer } from "./DiffViewer";
import type { DiffComparison } from "./rows";

type Props = { comparison: DiffComparison & { stats: DiffStats } };
export function ComparisonViewer({ comparison }: Props) {
  const { move, jump } = useComparisonNavigation(comparison);
  return (
    <>
      <div className="group-bar">
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
      </div>
      <DiffViewer
        projection={comparison}
        onMove={move}
        onSelection={() => {}}
        jump={jump}
      />
    </>
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
