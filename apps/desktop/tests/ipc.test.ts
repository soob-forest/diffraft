import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/ipc";

describe("IPC boundary", () => {
  it("shows safe messages without serializing unknown exceptions", () => {
    expect(errorMessage({ message: "저장 실패" })).toBe("저장 실패");
    expect(errorMessage({ token: "private" })).not.toContain("private");
  });
});
