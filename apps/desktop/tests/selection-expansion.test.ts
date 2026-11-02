import { expect, it } from "vitest";
import { expandCandidateSelection } from "../src/review/selection-expansion";
import { projection, proposal } from "./support/review-projection";

it("previews a sentence or paragraph range inside one candidate", () => {
  const text = "첫 문장입니다. 둘째 문장입니다.\n\n다음 문단입니다.";
  const value = projection([proposal()]);
  value.after = text;
  value.batch.proposals[0].operation.after = text;
  value.groups[0].afterRanges = [
    { from: 0, to: new TextEncoder().encode(text).length },
  ];
  const sentence = expandCandidateSelection(
    value,
    { side: "after", from: 12, to: 12 },
    "sentence",
  );
  expect(text.slice(sentence.from, sentence.to).trim()).toBe(
    "둘째 문장입니다.",
  );
  const paragraph = expandCandidateSelection(
    value,
    { side: "after", from: text.length - 2, to: text.length - 2 },
    "paragraph",
  );
  expect(text.slice(paragraph.from, paragraph.to)).toBe("다음 문단입니다.");
});
it("asks for a drag rather than guessing Markdown structure or deleted text", () => {
  const value = projection([proposal()]);
  value.after = "| 표 |";
  value.batch.proposals[0].operation.after = value.after;
  value.groups[0].afterRanges = [{ from: 0, to: 7 }];
  expect(() =>
    expandCandidateSelection(
      value,
      { side: "after", from: 0, to: 0 },
      "sentence",
    ),
  ).toThrow(/드래그/);
  expect(() =>
    expandCandidateSelection(
      value,
      { side: "before", from: 0, to: 0 },
      "sentence",
    ),
  ).toThrow();
});
