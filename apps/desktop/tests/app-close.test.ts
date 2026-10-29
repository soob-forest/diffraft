import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { createCloseRequest } from "../src/useAppClose";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

function setup() {
  const options = {
    lock: { current: false },
    flush: vi.fn(async () => {}),
    onError: vi.fn(),
    onClosing: vi.fn(),
  };
  const close = createCloseRequest(options);
  const event = { preventDefault: vi.fn() };
  return { options, close, event };
}

it("keeps the window while saving and invokes app completion only after flush", async () => {
  const { options, close, event } = setup();
  let finish = () => {};
  options.flush.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const first = close(event);
  await close(event);
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(options.flush).toHaveBeenCalledTimes(1);
  expect(options.lock.current).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
  finish();
  await first;
  expect(invoke).toHaveBeenCalledExactlyOnceWith("complete_shutdown", {
    request: { schemaVersion: 1 },
  });
  expect(options.onClosing).toHaveBeenCalledExactlyOnceWith(true);
});

it("a save failure keeps input available, does not exit and permits retry", async () => {
  const { options, close, event } = setup();
  options.flush.mockRejectedValueOnce(new Error("원문 저장 실패"));
  await close(event);
  expect(invoke).not.toHaveBeenCalled();
  expect(options.lock.current).toBe(false);
  expect(options.onClosing).toHaveBeenLastCalledWith(false);
  expect(options.onError).toHaveBeenCalledWith("원문 저장 실패");
  await close(event);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("a native shutdown failure restores controls and permits retry", async () => {
  const { options, close, event } = setup();
  vi.mocked(invoke).mockRejectedValueOnce(new Error("생성 중단 실패"));
  await close(event);
  expect(options.lock.current).toBe(false);
  expect(options.onClosing).toHaveBeenLastCalledWith(false);
  expect(options.onError).toHaveBeenCalledWith("생성 중단 실패");
  await close(event);
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("navigation in progress cannot start a close or release its lock", async () => {
  const { options, close, event } = setup();
  options.lock.current = true;
  await close(event);
  expect(options.flush).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(options.lock.current).toBe(true);
  expect(options.onError).toHaveBeenCalledWith(
    "문서 이동이 끝난 뒤 다시 종료해 주세요.",
  );
});
