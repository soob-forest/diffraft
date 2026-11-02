import { useRef } from "react";
import {
  type SelectedGenerationProps,
  useSelectedGeneration,
} from "../review/useSelectedGeneration";

type Props = SelectedGenerationProps & { documentId: string; taskId: string };

export function useSourceGeneration(props: Props) {
  const owner = JSON.stringify([props.documentId, props.taskId]);
  const currentOwner = useRef(owner),
    operationOwner = useRef<string | null>(owner);
  currentOwner.current = owner;
  const form = useSelectedGeneration({
    selection: props.selection,
    prepare: props.prepare,
    onBusy: (busy) => {
      if (busy) operationOwner.current = owner;
      props.onBusy(busy);
    },
    onSaved: (result) => {
      operationOwner.current = null;
      if (currentOwner.current === owner) props.onSaved(result);
    },
  });
  return {
    ...form,
    message: operationOwner.current === owner ? form.message : "",
  };
}
