import { invoke } from "@tauri-apps/api/core";
import { expect, it, vi } from "vitest";
import {
  modelSettings,
  modelTestCurrent,
  readModel,
} from "../src/connection/model";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("reads and saves model settings through offline IPC only", async () => {
  vi.mocked(invoke).mockResolvedValue("haiku");
  expect(await readModel()).toBe("haiku");
  expect(invoke).toHaveBeenLastCalledWith("model_settings_command", {
    request: { schemaVersion: 1, action: { kind: "read" } },
  });
  await modelSettings({ kind: "save", model: "opus" });
  expect(invoke).toHaveBeenLastCalledWith("model_settings_command", {
    request: { schemaVersion: 1, action: { kind: "save", model: "opus" } },
  });
});

it("never carries a successful test over to a different or unsaved model", () => {
  expect(modelTestCurrent("sonnet", "sonnet", "sonnet")).toBe(true);
  expect(modelTestCurrent("sonnet", "sonnet", "opus")).toBe(false);
  expect(modelTestCurrent("sonnet", "opus", "opus")).toBe(false);
  expect(modelTestCurrent(null, "sonnet", "sonnet")).toBe(false);
  expect(modelTestCurrent("cli_default", null, "cli_default")).toBe(false);
});

it("surfaces a settings failure rather than silently choosing a model", async () => {
  vi.mocked(invoke).mockRejectedValueOnce(new Error("설정 저장 실패"));
  await expect(modelSettings({ kind: "save", model: "opus" })).rejects.toThrow(
    "설정 저장 실패",
  );
});
