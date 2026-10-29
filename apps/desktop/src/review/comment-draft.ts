export type CommentTarget = {
  fromUtf16: number;
  toUtf16: number;
  quote: string;
};
export type CommentDraft = {
  text: string;
  revision: number;
  target: CommentTarget;
  id: string;
};

export function validCommentDraft(
  draft: CommentDraft,
  revision: number,
  source: string,
) {
  const { fromUtf16, toUtf16, quote } = draft.target;
  return (
    draft.revision === revision &&
    fromUtf16 >= 0 &&
    toUtf16 > fromUtf16 &&
    source.slice(fromUtf16, toUtf16) === quote
  );
}
