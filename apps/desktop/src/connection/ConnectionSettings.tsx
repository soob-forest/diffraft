import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProviderSettings } from "./ProviderSettings";
import "./connection.css";

export function ConnectionSettings() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => {
      const target = trigger.current?.getClientRects().length
        ? trigger.current
        : document.querySelector<HTMLButtonElement>(
            'button[aria-controls="document-list"]',
          );
      target?.focus();
    });
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        AI 연결 설정
      </button>
      {open && createPortal(<ConnectionDialog close={close} />, document.body)}
    </>
  );
}

function ConnectionDialog({ close }: { close: () => void }) {
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="connection-dialog"
      aria-labelledby="connection-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <ProviderSettings close={close} onBusy={setBusy} />
    </dialog>
  );
}
