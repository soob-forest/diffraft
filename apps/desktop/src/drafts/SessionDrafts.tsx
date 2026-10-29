import {
  createContext,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { DraftStore } from "./store";

const DraftContext = createContext<DraftStore | null>(null);
export function SessionDrafts({ children }: { children: ReactNode }) {
  const [store] = useState(() => new DraftStore());
  return <DraftContext value={store}>{children}</DraftContext>;
}

export function useSessionDraft<T>(key: string, initial: T) {
  const store = useContext(DraftContext);
  if (!store) throw new Error("초안 저장소를 찾을 수 없습니다.");
  const value = useSyncExternalStore(store.subscribe, () =>
    store.read(key, initial),
  );
  return {
    value,
    set: (next: T) => store.write(key, next),
    replace: (expected: T, next: T) => store.replace(key, expected, next),
  };
}
