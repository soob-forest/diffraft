import { type ReactNode, useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import { CommonRules } from "./CommonRules";
import type { FlushRef } from "./DocumentWorkspace";
import { FirstRequest } from "./FirstRequest";
import { firstRequestEntries } from "./first-request";
import type { OperationGate } from "./operation-gate";
import type { RequestScope } from "./request-scope";
import { TaskChooser } from "./TaskChooser";
import { TaskForm } from "./TaskForm";
import { useConditionFlush } from "./useConditionFlush";
import type { DocumentModel } from "./useDocument";

interface Props {
  model: DocumentModel;
  scope: RequestScope;
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
  const { store } = useDraftPersistence();
  const pending = firstRequestEntries(store, props.documentId).some(
    ({ value }) => value.taskId === selected,
  );
  const conditions = (
    <TaskConditions props={props} conditionFlush={conditionFlush} task={task} />
  );
  return (
    <section className="task-panel" aria-label="작업" inert={props.disabled}>
      {task && !pending ? (
        props.children(conditions)
      ) : (
        <FirstRequest
          model={props.model}
          taskId={selected || undefined}
          scope={props.scope}
          conditionFlush={conditionFlush.rules}
          onTask={(value) => {
            props.onSaved(value);
            props.onSelect(value.id);
          }}
        />
      )}
      <details className="task-management">
        <summary>작업 관리</summary>
        <TaskChooser
          disabled={Boolean(props.disabled)}
          tasks={props.tasks}
          selected={selected}
          onChoose={(id) => {
            void choose(id);
          }}
        />
      </details>
      {error && <p role="alert">{error}</p>}
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
