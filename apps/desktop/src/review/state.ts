import type { ReviewProjection } from "../generated/ReviewProjection";
import type { TaskReview } from "../generated/TaskReview";

export function reviewFingerprint(projection: ReviewProjection | null): string {
  if (!projection) return "";
  return JSON.stringify([
    projection.currentHeadId,
    projection.batch.id,
    projection.batch.status,
    projection.batch.proposals.map((p) => [
      p.id,
      p.revision,
      p.groupId,
      p.decision,
      p.validity,
    ]),
  ]);
}
export function confirmationFingerprint(
  projection: ReviewProjection,
  state: TaskReview,
  blocked: boolean,
) {
  return JSON.stringify([
    reviewFingerprint(projection),
    state.generating,
    blocked,
  ]);
}
export class ReadSequence {
  private sequence = 0;
  begin() {
    return ++this.sequence;
  }
  current(ticket: number) {
    return ticket === this.sequence;
  }
  invalidate() {
    this.sequence++;
  }
}
