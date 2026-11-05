import { useMemo, useState } from "react";
import type { Heading } from "../generated/Heading";
import {
  compactReviewRows,
  type DiffComparison,
  reviewRows,
  splitRows,
} from "./rows";

type ViewOptions = { split: boolean; full: boolean; whitespace: boolean };
export type DiffPreferences = ViewOptions & {
  onChange: (changes: Partial<ViewOptions>) => void;
};

function useSettings(beforeChange: () => void, preferences?: DiffPreferences) {
  const [local, setLocal] = useState<ViewOptions>({
    split: false,
    full: false,
    whitespace: false,
  });
  const value = preferences ?? local;
  const change = (update: Partial<ViewOptions>) => {
    beforeChange();
    if (preferences) preferences.onChange(update);
    else setLocal((current) => ({ ...current, ...update }));
  };
  return {
    split: value.split,
    full: value.full,
    whitespace: value.whitespace,
    setSplit: (split: boolean) => change({ split }),
    setFull: (full: boolean) => change({ full }),
    setWhitespace: (whitespace: boolean) => change({ whitespace }),
  };
}

export function useDiffDisplay(
  projection: DiffComparison,
  beforeChange: () => void,
  headings?: Heading[],
  preferences?: DiffPreferences,
) {
  const settings = useSettings(beforeChange, preferences);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => {
    const source = reviewRows(projection, expanded, settings.full);
    return settings.full || expanded.size || !headings
      ? source
      : compactReviewRows(
          source,
          headings.map((heading) => heading.fromUtf16),
        );
  }, [projection, expanded, settings.full, headings]);
  const pairs = useMemo(() => splitRows(rows), [rows]);
  const before = useMemo(() => pairs.map((pair) => pair.before), [pairs]);
  const after = useMemo(() => pairs.map((pair) => pair.after), [pairs]);
  return {
    ...settings,
    rows,
    before,
    after,
    expand: (key: string) => {
      beforeChange();
      setExpanded((values) => new Set([...values, key]));
    },
  };
}
