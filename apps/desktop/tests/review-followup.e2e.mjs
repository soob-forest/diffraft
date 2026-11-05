import {
  assertVisibleDecisionFailure,
  assertVisibleStaleReason,
} from "./support/review-followup-alert.mjs";
import {
  closeFollowupDetail,
  prepareFollowupReview,
  recordFollowup,
} from "./support/review-followup-fixture.mjs";
import { assertComparisonScrollRoundtrip } from "./support/review-followup-scroll.mjs";
import {
  assertRelatedTextPage,
  assertSelectedTextPage,
} from "./support/review-followup-text.mjs";
import { foregroundUnitDisplay } from "./support/unit-review-display.mjs";
import { prepareGroupedReview } from "./support/unit-review-grouped.mjs";

describe("변경 검토 보완 · 실제 비교 위치·중요 오류·텍스트 페이지", () => {
  afterEach(recordFollowupCase);

  it("부분 승인 뒤 current/original의 실제 스크롤·선택과 읽기 포커스를 보존한다", async () => {
    const fixture = await prepareFollowupReview("rewrite");
    await assertComparisonScrollRoundtrip(fixture);
  });
  it("800×600/200% 승인 실패를 도구 밖에 표시하고 입력·대상·원문을 보존한다", async () => {
    const fixture = await prepareFollowupReview("review");
    await assertVisibleDecisionFailure(fixture);
  });
  it("60행 초과 실제 계획에서 단위 선택·페이지 이탈·복귀를 연결한다", async () => {
    const fixture = await prepareFollowupReview("bulk-review");
    await assertSelectedTextPage(fixture);
  });
  it("800×600/200% 외부 변경의 승인 잠김 이유를 도구 밖에 표시한다", async () => {
    const fixture = await prepareFollowupReview("conflict-review");
    await assertVisibleStaleReason(fixture);
  });
  it("실제 결합 단위의 모든 관련 위치 버튼이 텍스트의 해당 행으로 이동한다", async () => {
    const grouped = await prepareGroupedReview();
    await closeFollowupDetail();
    await assertRelatedTextPage(grouped);
  });
});

async function recordFollowupCase() {
  try {
    await recordFollowup(
      `case-${this.currentTest.parent.tests.indexOf(this.currentTest)}`,
      {
        outcome: this.currentTest.state,
        scenario: this.currentTest.title,
        focus: await browser.execute(() => ({
          tag: document.activeElement?.tagName,
          classes: document.activeElement?.className,
        })),
      },
    );
  } finally {
    await browser.setWindowSize(1440, 900);
    await foregroundUnitDisplay(1);
  }
}
