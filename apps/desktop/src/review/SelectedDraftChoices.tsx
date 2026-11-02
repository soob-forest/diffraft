import type { useSelectedRequest } from "./useSelectedRequest";
export function SelectedDraftChoices({
  selection,
}: {
  selection: ReturnType<typeof useSelectedRequest>;
}) {
  if (!selection.choices.length) return null;
  return (
    <fieldset>
      <legend>같은 범위의 보관된 초안 선택</legend>
      <p>
        여러 초안이 있습니다. 이어 쓸 지시를 선택하세요. 다른 초안도 보관됩니다.
      </p>
      {selection.choices.map((choice, index) => (
        <button
          key={choice.key}
          type="button"
          onClick={() => selection.chooseDraft(choice)}
        >
          초안 {index + 1} ·{" "}
          {choice.value.instruction.slice(0, 80) || "빈 지시"}
        </button>
      ))}
    </fieldset>
  );
}
