import type { FirstRequestDraft } from "./first-request";
export function FirstConditions({
  value,
  set,
  children,
}: {
  value: FirstRequestDraft;
  set: (value: FirstRequestDraft) => void;
  children: React.ReactNode;
}) {
  return (
    <details className="task-condition-details">
      <summary>계속 참고할 조건 (선택)</summary>
      <label>
        작업 이름
        <input
          value={value.name}
          onChange={(event) => set({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        이 작업에서 계속 참고할 방향
        <textarea
          rows={2}
          value={value.goal}
          onChange={(event) => set({ ...value, goal: event.target.value })}
        />
      </label>
      <label>
        이 작업에서 유지할 조건
        <textarea
          rows={2}
          value={value.rules}
          onChange={(event) => set({ ...value, rules: event.target.value })}
        />
      </label>
      {children}
    </details>
  );
}
