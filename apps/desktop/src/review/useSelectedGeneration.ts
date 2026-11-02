import { useEffect, useRef, useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import { errorMessage } from "../ipc";
import {
  confirmSelected,
  prepareSelected,
  saveDirectSelection,
} from "./selected-request-operations";
import type { useSelectedRequest } from "./useSelectedRequest";

export type SelectedGenerationProps = {
  selection: ReturnType<typeof useSelectedRequest>;
  prepare: () => Promise<void>;
  onBusy: (value: boolean) => void;
  onSaved: (result: ConversationResult) => void;
};
export function useSelectedGeneration(props: SelectedGenerationProps) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async (operation: () => Promise<void>) => {
    if (lock.current || props.selection.locked) return;
    lock.current = true;
    setBusy(true);
    props.onBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (reason) {
      if (mounted.current) setMessage(errorMessage(reason));
    } finally {
      lock.current = false;
      props.onBusy(false);
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  const prepare = () => run(() => prepareSelected(props, mounted));
  const confirm = () => run(() => confirmSelected(props, mounted, setMessage));
  const saveDirect = () =>
    run(() => saveDirectSelection(props, mounted, setMessage));
  return { busy, message, prepare, confirm, saveDirect };
}
