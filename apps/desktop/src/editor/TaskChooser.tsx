import { useEffect, useState } from "react";
import type { TaskSnapshot } from "../generated/TaskSnapshot";

type Props = {
  disabled: boolean;
  tasks: TaskSnapshot[];
  selected: string;
  onChoose: (id: string) => void;
};
export function TaskChooser(props: Props) {
  const [expanded, setExpanded] = useState(() => window.innerWidth > 1000);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1000px)");
    const update = () => setExpanded(!query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <>
      <h2 className="task-context-heading">현재 작업</h2>
      <button
        className="task-picker-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        작업 선택
      </button>
      <div className="task-picker-region" hidden={!expanded}>
        <TaskPicker {...props} />
      </div>
    </>
  );
}

function TaskPicker({
  disabled,
  tasks,
  selected,
  onChoose,
}: {
  disabled: boolean;
  tasks: TaskSnapshot[];
  selected: string;
  onChoose: (id: string) => void;
}) {
  return (
    <label className="task-picker">
      <span className="visually-hidden">이 문서의 작업</span>
      <select
        disabled={disabled}
        value={selected}
        onChange={(event) => onChoose(event.target.value)}
      >
        <option value="">새 작업</option>
        {tasks.map((value) => (
          <option value={value.id} key={value.id}>
            {value.goal}
          </option>
        ))}
      </select>
    </label>
  );
}
