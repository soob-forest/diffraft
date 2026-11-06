import type { ScopeSelection } from "../generated/ScopeSelection";
import { editorCommand } from "./api";
import type { RequestScope } from "./request-scope";
import { captureSourceSelection } from "./source-selection";
import type { DocumentModel } from "./useDocument";

export async function confirmRequestScope({
  model,
  requestScope,
  selection: selected,
}: {
  model: DocumentModel;
  requestScope: RequestScope;
  selection?: ScopeSelection;
}) {
  await model.autosave.flush();
  const source = model.autosave.document.content;
  const selection = selected ?? requestScope.value(source);
  const captured =
    requestScope.kind === "selection"
      ? captureSourceSelection(source, requestScope.selection)
      : null;
  const scope = await editorCommand(
    {
      kind: "scope",
      documentId: model.state.document.id,
      expectedVersion: model.autosave.document.version,
      selection,
    },
    "scope",
  );
  return { scope, captured };
}
