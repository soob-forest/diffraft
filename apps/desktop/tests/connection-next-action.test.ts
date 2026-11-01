import { expect, it } from "vitest";
import { connectionNextAction } from "../src/connection/next-action";

it("offers one next action from known connection state without guessing errors", () => {
  expect(connectionNextAction(undefined, "")).toBe("inspect");
  expect(connectionNextAction("MISSING", "")).toBe("install");
  expect(connectionNextAction("AUTH_REQUIRED", "")).toBe("login");
  expect(connectionNextAction("READY", "")).toBe("close");
  expect(connectionNextAction("READY", "unknown")).toBe("inspect");
});
