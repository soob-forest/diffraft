import { launcher as TauriLauncher } from "@wdio/tauri-service";
import { observeExit } from "./process-exit.mjs";

export { default } from "@wdio/tauri-service";

// Pinned @wdio/tauri-service 1.5.1 owns the actual app ChildProcess here.
export class launcher extends TauriLauncher {
  async onPrepare(config, capabilities) {
    await super.onPrepare(config, capabilities);
    if (
      !(this.embeddedProcesses instanceof Map) ||
      this.embeddedProcesses.size !== 1
    ) {
      throw new Error("종료 관측에는 실제 앱 자식 프로세스 1개가 필요합니다.");
    }
    for (const { proc } of this.embeddedProcesses.values()) {
      observeExit(proc, process.env.DOCREVIEW_E2E_DATA);
    }
  }
}
