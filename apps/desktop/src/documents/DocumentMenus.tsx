import { createContext, type ReactNode, useContext, useState } from "react";
import type { useWorkspace } from "../workspace";
import { DocumentActionsMenu, type MenuTarget } from "./DocumentActionsMenu";
import { ForgetDocumentDialog } from "./ForgetDocumentDialog";
import { focusDocumentTarget } from "./menu-behavior";

type Workspace = ReturnType<typeof useWorkspace>;
type Actions = {
  workspace: Workspace;
  show: (target: MenuTarget) => void;
  target: MenuTarget | null;
};
const Context = createContext<Actions | null>(null);
export function DocumentMenus({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: ReactNode;
}) {
  const menus = useMenus(workspace);
  const { target, forget, failure, close, choose, cancel, confirm, setTarget } =
    menus;
  return (
    <Context value={{ workspace, show: setTarget, target }}>
      {children}
      {target && !workspace.busy && (
        <DocumentActionsMenu target={target} close={close} choose={choose} />
      )}
      {forget && (
        <ForgetDocumentDialog
          document={forget.document}
          busy={workspace.busy}
          error={failure ? workspace.error || failure : ""}
          cancel={cancel}
          confirm={() => void confirm()}
        />
      )}
    </Context>
  );
}
function useMenus(workspace: Workspace) {
  const [target, setTarget] = useState<MenuTarget | null>(null);
  const [forget, setForget] = useState<MenuTarget | null>(null);
  const [failure, setFailure] = useState("");
  const close = (restore: boolean) => {
    setTarget(null);
    if (restore && target) focusDocumentTarget(target.trigger);
  };
  const choose = (action: "open" | "complete" | "forget") => {
    if (!target) return;
    setTarget(null);
    if (action === "forget") {
      setFailure("");
      setForget(target);
      return;
    }
    const result =
      action === "open"
        ? workspace.navigate(target.document.id)
        : workspace.complete(target.document);
    void result.then(() => focusDocumentTarget(target.trigger));
  };
  const cancel = () => {
    setForget(null);
    if (forget) focusDocumentTarget(forget.trigger);
  };
  const confirm = async () => {
    if (!forget) return;
    if (await workspace.forget(forget.document)) cancel();
    else
      setFailure(
        "목록에서 제거하지 못했습니다. 입력 저장 상태와 오류를 확인한 뒤 다시 시도해 주세요.",
      );
  };
  return { target, forget, failure, close, choose, cancel, confirm, setTarget };
}

export function useDocumentMenus() {
  const context = useContext(Context);
  if (!context)
    throw new Error("문서 메뉴는 문서 목록 안에서 사용해야 합니다.");
  return context;
}
