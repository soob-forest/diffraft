import { expect, it } from "vitest";
import {
  revealTextDiffRequest,
  revealTextDiffRow,
} from "../src/review/text-diff-reveal";

function fixture(rowTop = 600, visible = true) {
  const scroller = {
    scrollTop: 50,
    getBoundingClientRect: () => ({ top: 100, bottom: 400, height: 300 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 132 }) }),
  };
  const row = {
    dataset: { rowKey: "delete:83:null" },
    getClientRects: () => (visible ? [{}] : []),
    getBoundingClientRect: () => ({
      top: rowTop,
      bottom: rowTop + 60,
      height: 60,
    }),
  };
  const list = {
    closest: () => scroller,
    children: [row],
  } as unknown as HTMLOListElement;
  return {
    list,
    scroller,
    show: () => {
      visible = true;
    },
  };
}

it("reveals a row below the page viewport by scrolling only its text container", () => {
  const { list, scroller } = fixture();
  expect(revealTextDiffRow(list, "delete:83:null")).toBe(true);
  expect(scroller.scrollTop).toBe(318);
});

it("places a row below the sticky summary rather than behind it", () => {
  const { list, scroller } = fixture(110);
  expect(revealTextDiffRow(list, "delete:83:null")).toBe(true);
  expect(scroller.scrollTop).toBe(20);
});

it("defers hidden or inactive requests and consumes the visible request once", () => {
  const { list, scroller } = fixture();
  const request = { rowKey: "delete:83:null" };
  expect(revealTextDiffRequest(list, request, false, null)).toBeNull();
  expect(scroller.scrollTop).toBe(50);
  const handled = revealTextDiffRequest(list, request, true, null);
  expect(handled).toBe(request);
  scroller.scrollTop = 700;
  expect(revealTextDiffRequest(list, request, true, handled)).toBe(handled);
  expect(scroller.scrollTop).toBe(700);
  const hidden = fixture(600, false);
  expect(revealTextDiffRequest(hidden.list, request, true, null)).toBeNull();
  expect(hidden.scroller.scrollTop).toBe(50);
  hidden.show();
  expect(revealTextDiffRequest(hidden.list, request, true, null)).toBe(request);
  expect(hidden.scroller.scrollTop).toBe(318);
});

it("leaves unrelated or already visible rows alone", () => {
  const { list, scroller } = fixture(200);
  expect(revealTextDiffRow(list, "delete:83:null")).toBe(true);
  expect(scroller.scrollTop).toBe(50);
  expect(revealTextDiffRow(list, "delete:84:null")).toBe(false);
  expect(scroller.scrollTop).toBe(50);
});
