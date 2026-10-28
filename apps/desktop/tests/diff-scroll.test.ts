import type { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import { rememberScroll, synchronizeScroll } from "../src/review/scroll";

it("synchronizes the same logical row when earlier wrapped rows have unequal estimated heights", () => {
  const source = {
    documentPadding: { top: 0 },
    lineBlockAtHeight: () => ({ from: 20, top: 100, height: 26 }),
    state: { doc: { lineAt: () => ({ number: 5 }) } },
  } as unknown as EditorView;
  const scrollDOM = { scrollTop: 0 };
  const target = {
    documentPadding: { top: 0 },
    scrollDOM,
    lineBlockAt: () => ({ top: 400, height: 26 }),
    state: {
      doc: {
        lines: 10,
        line: (number: number) => {
          expect(number).toBe(5);
          return { from: 20 };
        },
      },
    },
  } as unknown as EditorView;
  synchronizeScroll(
    new Map([
      ["before", source],
      ["after", target],
    ]),
    "before",
    108,
  );
  expect(scrollDOM.scrollTop).toBe(408);
});
it("remembers the actual visible source row despite stale height estimates and virtualized gaps", () => {
  const line = (key: string, bottom: number) => ({
    dataset: { sourceKey: key },
    getBoundingClientRect: () => ({ bottom }),
  });
  const view = {
    scrollDOM: { getBoundingClientRect: () => ({ top: 100 }) },
    contentDOM: {
      querySelectorAll: () => [
        line("equal:1:1", -500),
        line("filler", 110),
        line("equal:32:32", 125),
      ],
    },
    lineBlockAtHeight: () => {
      throw new Error("height estimate is stale");
    },
  } as unknown as EditorView;
  const bookmark = { current: { selection: null, scrollKey: "equal:31:31" } };
  rememberScroll(view, bookmark);
  expect(bookmark.current.scrollKey).toBe("equal:32:32");
});
