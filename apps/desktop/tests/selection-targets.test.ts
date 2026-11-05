import { expect, it } from "vitest";
import { selectedRequestTarget } from "../src/review/selection-targets";
import { projection } from "./support/review-projection";

it("keeps whole rewrite candidate selection distinct from confirmed text", () => {
  const value = projection();
  value.batch.mode = "REWRITE";
  value.batch.reviewMode = "WHOLE";
  value.batch.candidateMarkdown = value.after;
  expect(
    selectedRequestTarget(value, { side: "after", from: 0, to: 1 }).kind,
  ).toBe("rewrite");
  value.currentHeadId = "changed";
  expect(() =>
    selectedRequestTarget(value, { side: "after", from: 0, to: 1 }),
  ).toThrow();
});
it("maps unchanged projected context to the actual current head", () => {
  const value = projection([]);
  value.before = "확정 문장\r\n";
  value.after = value.before;
  const target = selectedRequestTarget(value, {
    side: "after",
    from: 0,
    to: 5,
  });
  expect(target.kind).toBe("confirmed");
  expect(target.selection.quote).toBe("확정 문장");
});
