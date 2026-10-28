import { invertedEffects } from "@codemirror/commands";
import { type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  applySourceChanges,
  displayText,
  type SourceChange,
} from "./source-buffer";

const restoreRaw = StateEffect.define<string>();
export const rawSource = StateField.define<string>({
  create: (state) => state.doc.toString(),
  update(raw, transaction) {
    if (!transaction.docChanged) return raw;
    const target = transaction.newDoc.toString();
    const exact = transaction.effects.find(
      (effect) => effect.is(restoreRaw) && displayText(effect.value) === target,
    );
    if (exact?.is(restoreRaw)) return exact.value;
    const changes: SourceChange[] = [];
    transaction.changes.iterChanges((from, to, _newFrom, _newTo, insert) => {
      changes.push({ from, to, insert: insert.toString() });
    });
    return applySourceChanges(raw, changes);
  },
});

export function sourceHistory(initial: string): Extension {
  return [
    rawSource.init(() => initial),
    invertedEffects.of((transaction) =>
      transaction.docChanged
        ? [restoreRaw.of(transaction.startState.field(rawSource))]
        : [],
    ),
  ];
}
