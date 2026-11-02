import { expect, it } from "vitest";
import {
  currentResult,
  currentResultGroup,
  isCurrentResult,
} from "../src/review/result-destination";
import { projection, proposal } from "./support/review-projection";

it("opens an explicitly current result at its exact group without treating conversation history as editable", () => {
  const value = projection([
    proposal(),
    proposal({ id: "second", groupId: "second", revision: 2 }),
  ]);
  const destination = currentResult({
    batchId: value.batch.id,
    proposalId: "second",
    revision: 2,
    status: "PENDING",
  });
  expect(isCurrentResult(destination)).toBe(true);
  expect(currentResultGroup(value, destination)?.id).toBe("second");
  expect(
    currentResultGroup(value, { ...destination, revision: 1 }),
  ).toBeUndefined();
  expect(isCurrentResult({ ...destination, current: false })).toBe(false);
});
