import { type ReactNode, useState } from "react";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import { CommonRules } from "./CommonRules";
import type { FlushRef } from "./DocumentWorkspace";
import type { OperationGate } from "./operation-gate";
import { TaskChooser } from "./TaskChooser";
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
  children: (conditions: ReactNode) => ReactNode;
}
export function TaskPanel(props: Props) {
  const selected = props.selected;
  const conditionFlush = useConditionFlush(props.flushRef);
  const { choose, error } = useTaskChoice(props);
  const task = props.tasks.find((value) => value.id === selected);
  const conditions = (
    <TaskConditions props={props} conditionFlush={conditionFlush} task={task} />
  );
  return (
    <section className="task-panel" aria-label="작업" inert={props.disabled}>
      <TaskChooser
        disabled={Boolean(props.disabled)}
        tasks={props.tasks}
        selected={selected}
        onChoose={(id) => {
          void choose(id);
        }}
      />
      {error && <p role="alert">{error}</p>}
      {!task && (
        <p>
          작업은 같은 목표로 요청과 검토를 이어가는 공간입니다. 목표를 입력하고
          작업을 만든 뒤 첫 요청을 보내세요.
        </p>
      )}
      {task ? props.children(conditions) : conditions}
    </section>
  );
}

function TaskConditions({
  props,
  conditionFlush,
  task,
}: {
  props: Props;
  conditionFlush: ReturnType<typeof useConditionFlush>;
  task: TaskSnapshot | undefined;
}) {
  return (
    <TaskForm
      key={`conditions:${props.selected}`}
      task={task}
      documentId={props.documentId}
      flush={props.flush}
      flushRef={conditionFlush.task}
      onSaved={(value) => {
        props.onSaved(value);
        props.onSelect(value.id);
      }}
    >
      <CommonRules
        documentId={props.documentId}
        flushRef={conditionFlush.rules}
      />
    </TaskForm>
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
