import { useState } from "react";
import { errorMessage } from "../ipc";
import type { useDocument } from "./useDocument";
export function useConflict(model: ReturnType<typeof useDocument>) {
  const [conflict, setConflict] = useState(false);
  const compare = async () => {
    model.gate.assertIdle();
    try {
      await model.autosave.flush();
    } catch (error) {
      model.setError(errorMessage(error));
    }
    setConflict(true);
  };
  return { open: conflict, close: () => setConflict(false), compare };
}
