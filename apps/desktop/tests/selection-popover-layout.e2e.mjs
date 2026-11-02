import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { popupLayouts } from "./support/popover-layout.mjs";
import { prepare, root } from "./support/review-fixture.mjs";
import { selectSource } from "./support/source-ui.mjs";
import { selectDiffText } from "./support/ux-ui.mjs";

let fixture;
describe("선택 팝오버의 창 크기와 확대", () => {
  after(async () => {
    const expected = JSON.parse(
      await readFile(join(root, "popover-expected.json"), "utf8"),
    );
    await $(".sidebar").$(`button=${expected.fixture.document.title}`).click();
    await browser.waitUntil(
      async () =>
        (await $(".document-toolbar h1").getText()) ===
        expected.fixture.document.title,
    );
  });
  it("diff 팝오버를 3개 창과 3개 배율에서 가림 없이 클릭할 수 있다", async () => {
    fixture = await prepare("bulk-review");
    const proposal = fixture.batch.proposals.find((value) =>
      value.operation.headingPath.at(-1).startsWith("1."),
    );
    await popupLayouts(
      () => selectDiffText(proposal.operation.after),
      ".diff-panes",
      "diff-popup",
    );
  });
  it("원문 팝오버를 3개 창과 3개 배율에서 가림 없이 클릭할 수 있다", async () => {
    await $("button=원문").click();
    await popupLayouts(
      () => selectSource("출발 시간과 이동 경로를 함께 기록합니다."),
      ".source-editor",
      "source-popup",
    );
  });
});
