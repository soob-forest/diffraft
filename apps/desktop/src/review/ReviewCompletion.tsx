import { type ReactNode, useState } from "react";
export function ReviewCompletion({
  completed,
  historyOpen,
  children,
}: {
  completed: boolean;
  historyOpen: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!completed) return children;
  return (
    <details
      className="completed-review-records"
      open={expanded || historyOpen}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>이번 검토 기록 · 비교와 표시 설정</summary>
      {children}
    </details>
  );
}
