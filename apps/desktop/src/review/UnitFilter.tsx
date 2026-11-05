import type { UnitNavigation } from "./useUnitNavigation";

export function UnitFilter({ navigation }: { navigation: UnitNavigation }) {
  return (
    <label className="unit-filter">
      표시
      <select
        aria-label="변경 표시 범위"
        value={navigation.value.filter}
        onChange={(event) => {
          const filter = event.target.value;
          if (
            filter === "pending" ||
            filter === "processed" ||
            filter === "all"
          )
            navigation.update({ filter });
        }}
      >
        <option value="pending">미처리</option>
        <option value="processed">처리됨</option>
        <option value="all">전체</option>
      </select>
    </label>
  );
}
