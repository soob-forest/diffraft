import type { FlushRef } from "./DocumentWorkspace";
export function closeSourceRequest(
  run: (action: () => Promise<void>) => Promise<void>,
  conditions: FlushRef,
  close: () => void,
) {
  return run(async () => {
    await conditions.current?.();
    close();
  });
}
