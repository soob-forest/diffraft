import { useEffect, useRef, useState } from "react";
import type { AiPreferences } from "../generated/AiPreferences";
import type { AiProvider } from "../generated/AiProvider";
import { errorMessage } from "../ipc";
import { aiSettings } from "./provider";

function useLoadedPreferences() {
  const [prefs, setPrefs] = useState<AiPreferences | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const active = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision retries settings reads.
  useEffect(() => {
    let cancelled = false;
    active.current = true;
    setLoading(true);
    setError("");
    void aiSettings({ kind: "read" })
      .then((value) => {
        if (!cancelled) setPrefs(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [revision]);
  return {
    prefs,
    setPrefs,
    error,
    setError,
    loading,
    active,
    reload: () => setRevision((v) => v + 1),
  };
}

export function useProviderSettings(onBusy: (value: boolean) => void) {
  const loaded = useLoadedPreferences();
  const [selected, setSelected] = useState<AiProvider | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const provider = selected ?? loaded.prefs?.provider ?? "codex";
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  async function save() {
    if (lock.current || busy || loaded.loading || !loaded.prefs) return;
    lock.current = true;
    setBusy(true);
    loaded.setError("");
    setMessage("");
    try {
      const value = await aiSettings({ kind: "provider", provider });
      if (loaded.active.current) {
        loaded.setPrefs(value);
        setMessage("공급자 설정을 저장했습니다. 새 요청부터 사용합니다.");
      }
    } catch (reason) {
      if (loaded.active.current) loaded.setError(errorMessage(reason));
    } finally {
      lock.current = false;
      if (loaded.active.current) setBusy(false);
    }
  }
  return {
    ...loaded,
    provider,
    message,
    busy,
    setBusy,
    save,
    select: (value: AiProvider) => {
      setSelected(value);
      setMessage("");
    },
  };
}
