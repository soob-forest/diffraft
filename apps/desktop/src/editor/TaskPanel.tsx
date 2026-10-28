import { type ReactNode, useState } from "react";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import { CommonRules } from "./CommonRules";
import type { FlushRef } from "./DocumentWorkspace";
import type { OperationGate } from "./operation-gate";
import { TaskForm } from "./TaskForm";
import { useConditionFlush } from "./useConditionFlush";

interface Props {
  gate: OperationGate;
  documentId: string;
  tasks: TaskSnapshot[];
  flush: () => Promise<void>;
  onSaved: (task: TaskSnapshot) => void;
  flushRef: FlushRef;
  selected: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  children?: ReactNode;
}
export function TaskPanel(props: Props) {
  const selected = props.selected;
  const conditionFlush = useConditionFlush(props.flushRef);
  const { choose, error } = useTaskChoice(props);
  const task = props.tasks.find((value) => value.id === selected);
  return (
    <aside className="task-panel" aria-label="작업" inert={props.disabled}>
      <h2>문서 작업</h2>
      <p className="muted">작업마다 목표와 대화를 따로 보관합니다.</p>
      <TaskPicker
        tasks={props.tasks}
        selected={selected}
        onChoose={(id) => {
          void choose(id);
        }}
      />
      <CommonRules
        documentId={props.documentId}
        flushRef={conditionFlush.rules}
      />
      <TaskForm
        key={`conditions:${selected}`}
        task={task}
        documentId={props.documentId}
        flush={props.flush}
        flushRef={conditionFlush.task}
        onSaved={(value) => {
          props.onSaved(value);
          props.onSelect(value.id);
        }}
      />
      {error && <p role="alert">{error}</p>}
      {props.children}
    </aside>
  );
}

function useTaskChoice(props: Props) {
  const [error, setError] = useState("");
  const choose = async (id: string) => {
    try {
      await props.gate.run(async () => {
        await props.flush();
        await props.flushRef.current?.();
        const selected = await editorCommand(
          {
            kind: "select_task",
            documentId: props.documentId,
            taskId: id || null,
          },
          "selected_task",
        );
        props.onSelect(selected ?? "");
      });
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  return { choose, error };
}

function TaskPicker({
  tasks,
  selected,
  onChoose,
}: {
  tasks: TaskSnapshot[];
  selected: string;
  onChoose: (id: string) => void;
}) {
  return (
    <label>
      현재 작업
      <select
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
