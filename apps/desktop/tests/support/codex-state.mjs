import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { conversation } from "./generation-fixture.mjs";
import { invoke, root } from "./review-fixture.mjs";

const request = { schemaVersion: 1 };
export const settings = (action) =>
  invoke("ai_settings_command", { request: { ...request, action } });
export async function saveExpected(state, native) {
  const page = await conversation(state.task);
  if (native)
    await writeFile(
      ".artifacts/codex/native-summary.json",
      JSON.stringify({
        version: state.version,
        requestedModel: page.lastAttempt.request.value.model,
        successfulResponses: page.messages.filter(
          (message) => message.role === "ASSISTANT",
        ).length,
      }),
    );
  await writeFile(
    join(root, "codex-expected.json"),
    JSON.stringify({
      ...state,
      preferences: await settings({ kind: "read" }),
      messages: page.messages,
      pid: await invoke("e2e_process_id", {}),
    }),
  );
}
