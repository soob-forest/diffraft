import { useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { EditorState } from "../generated/EditorState";
import { editorCommand } from "./api";
import { Autosave, type SaveStatus } from "./autosave";
import { OperationGate } from "./operation-gate";
import { useEditorSnapshot } from "./useEditorSnapshot";

const EXTERNAL_CHECK_MS = 1000;

export function useDocument(initial: EditorState) {
  const buffer = useBuffer(initial.document.content);
  const [error, setError] = useState("");
  const [mutating, setMutating] = useState(false);
  const gate = useRef<OperationGate | null>(null);
  if (!gate.current) gate.current = new OperationGate(setMutating);
  const [status, setStatus] = useState<SaveStatus>(initialSaveStatus(initial));
  const { state, setState, taskSaved } = useEditorSnapshot(
    initial,
    status.version,
    setError,
  );
  const autosave = useAutosave(initial.document, setStatus);
  useExternalCheck(autosave, initial.document);
  return {
    state,
    taskSaved,
    content: buffer.content,
    status,
    error,
    setError,
    autosave,
    gate: gate.current,
    mutating,
    editorInitial: buffer.initial,
    editorEpoch: buffer.epoch,
    adoptSaved: (document: DocumentSnapshot, discardBuffered = false) => {
      autosave.adoptSaved(document, discardBuffered);
      buffer.reset(document.content);
      setState((value) => ({ ...value, document }));
      setError("");
    },
    relocateSaved: (document: DocumentSnapshot) => {
      autosave.adoptSaved(document);
      setState((value) => ({ ...value, document }));
      setError("");
    },
    change: (raw: string) => {
      buffer.setContent(raw);
      autosave.change(raw);
    },
  };
}

function useBuffer(text: string) {
  const [content, setContent] = useState(text);
  const [initial, setInitial] = useState(text);
  const [epoch, setEpoch] = useState(0);
  return {
    content,
    setContent,
    initial,
    epoch,
    reset: (next: string) => {
      setContent(next);
      setInitial(next);
      setEpoch((value) => value + 1);
    },
  };
}
function useAutosave(
  document: DocumentSnapshot,
  setStatus: (status: SaveStatus) => void,
) {
  const queue = useRef<Autosave | null>(null);
  if (!queue.current)
    queue.current = new Autosave(
      document,
      (action) => editorCommand(action, "document"),
      setStatus,
    );
  const autosave = queue.current;
  useEffect(() => {
    autosave.activate();
    setStatus(autosave.status);
    return () => autosave.dispose();
  }, [autosave, setStatus]);
  return autosave;
}

function useExternalCheck(queue: Autosave, initial: DocumentSnapshot) {
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking || queue.status.error) return;
      checking = true;
      const checkedVersion = queue.document.versionId;
      try {
        await editorCommand(
          { kind: "check", documentId: initial.id },
          "document",
        );
      } catch (error) {
        if (active && queue.document.versionId === checkedVersion)
          queue.block(error);
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, EXTERNAL_CHECK_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [queue, initial.id]);
}

export type DocumentModel = ReturnType<typeof useDocument>;

function initialSaveStatus(initial: EditorState): SaveStatus {
  return {
    label: "저장됨",
    dirty: false,
    saving: false,
    error: "",
    version: initial.document.version,
  };
}
