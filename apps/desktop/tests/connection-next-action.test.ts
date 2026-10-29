import { expect, it } from "vitest";
import { connectionNextAction } from "../src/connection/next-action";

it("offers one next action from known connection state without guessing errors", () => {
  expect(connectionNextAction(undefined, false, "")).toBe("inspect");
  expect(connectionNextAction("MISSING", false, "")).toBe("install");
  expect(connectionNextAction("AUTH_REQUIRED", false, "")).toBe("login");
  expect(connectionNextAction("READY", false, "")).toBe("close");
  expect(connectionNextAction("READY", true, "")).toBe("close");
  expect(connectionNextAction("READY", true, "unknown")).toBe("inspect");
});
