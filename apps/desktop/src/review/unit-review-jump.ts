import type { LogicalSelection } from "./coordinates";

export type UnitComparisonScope = "current" | "original";
export type UnitJump = {
  selection: LogicalSelection;
  serial: number;
  focus?: boolean;
  revealGroupHeading: true;
  scope: UnitComparisonScope;
};

export function unitComparisonJump(
  jump: UnitJump | null,
  scope: UnitComparisonScope,
  active: boolean,
) {
  return active && jump?.scope === scope ? jump : null;
}
