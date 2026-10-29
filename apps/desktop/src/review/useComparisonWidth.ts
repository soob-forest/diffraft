import { useEffect, useRef, useState } from "react";

// A rendered column includes its line-number gutter and excludes the divider.
const MIN_COMPARISON_COLUMN_WIDTH = 540;
export function useComparisonWidth(split: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const columns = [...element.querySelectorAll<HTMLElement>(".diff-pane")];
    const measure = () =>
      setNarrow(
        split &&
          columns.some(
            (column) => column.clientWidth < MIN_COMPARISON_COLUMN_WIDTH,
          ),
      );
    const observer = new ResizeObserver(measure);
    columns.forEach((column) => {
      observer.observe(column);
    });
    measure();
    return () => observer.disconnect();
  }, [split]);
  return { ref, narrow };
}
