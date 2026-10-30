import { useEffect, useRef, useState } from "react";
import type { ModelSelection } from "../generated/ModelSelection";
import { errorMessage } from "../ipc";
import { modelSettings, readModel } from "./model";

type ModelState = {
  selected: ModelSelection;
  saved: ModelSelection | null;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
};
const INITIAL: ModelState = {
  selected: "cli_default",
  saved: null,
  loading: true,
  saving: false,
  error: "",
  message: "",
};

function useLoadedModel() {
  const [state, setState] = useState(INITIAL);
  const [revision, reload] = useState(0);
  const active = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly retries a failed settings read.
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setState((state) => ({ ...state, loading: true, error: "" }));
    void readModel()
      .then((value) => {
        if (!cancelled)
          setState((state) => ({ ...state, selected: value, saved: value }));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setState((state) => ({ ...state, error: errorMessage(reason) }));
      })
      .finally(() => {
        if (!cancelled) setState((state) => ({ ...state, loading: false }));
      });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [revision]);
  return {
    state,
    setState,
    active,
    reload: () => reload((value) => value + 1),
  };
}

export function useModelSettings() {
  const { state, setState, active, reload } = useLoadedModel();
  const lock = useRef(false);
  async function save() {
    if (lock.current || state.loading || state.saved === null) return;
    lock.current = true;
    setState((state) => ({ ...state, saving: true, error: "", message: "" }));
    try {
      const value = await modelSettings({
        kind: "save",
        model: state.selected,
      });
      if (active.current)
        setState((state) => ({
          ...state,
          saved: value,
          message: "모델 설정을 저장했습니다. 새 요청부터 사용합니다.",
        }));
    } catch (reason) {
      if (active.current)
        setState((state) => ({ ...state, error: errorMessage(reason) }));
    } finally {
      lock.current = false;
      if (active.current) setState((state) => ({ ...state, saving: false }));
    }
  }
  return {
    ...state,
    save,
    reload,
    select: (selected: ModelSelection) =>
      setState((state) => ({ ...state, selected, message: "" })),
    ready:
      !state.loading &&
      !state.saving &&
      !state.error &&
      state.saved !== null &&
      state.selected === state.saved,
  };
}
