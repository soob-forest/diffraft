import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { errorMessage, SCHEMA_VERSION } from "../ipc";
import { useConnection } from "./useConnection";
import "./connection.css";

export function ConnectionSettings() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        AI 연결 설정
      </button>
      {open && <ConnectionDialog close={() => setOpen(false)} />}
    </>
  );
}

function ConnectionDialog({ close }: { close: () => void }) {
  const connection = useConnection();
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
        if (!connection.busy) close();
      }}
    >
      <h2 id="connection-title">공식 Claude Code 연결</h2>
      <p>macOS native CLI · 공식 구독 계정</p>
      <ConnectionDetails connection={connection} />
      <ConnectionActions connection={connection} />
      <InstallGuide />
      <p className="muted">
        로그인과 인증 정보는 공식 CLI가 관리합니다. 로컬 편집·저장에는 로그인할
        필요가 없습니다.
      </p>
      <button type="button" disabled={connection.busy} onClick={close}>
        설정 닫기
      </button>
    </dialog>
  );
}

type Props = { connection: ReturnType<typeof useConnection> };
function ConnectionDetails({ connection }: Props) {
  return (
    <>
      <p role="status" data-testid="connection-status">
        {connection.busy
          ? connection.cancelling
            ? "CLI 종료를 확인하는 중…"
            : "공식 CLI에 요청하는 중…"
          : (connection.report?.message ??
            "상태 다시 확인을 눌러 설치와 인증을 진단하세요.")}
      </p>
      {connection.report && (
        <dl>
          <dt>실행 파일</dt>
          <dd>{connection.report.executable ?? "찾지 못함"}</dd>
          <dt>버전</dt>
          <dd>{connection.report.version ?? "확인 필요"}</dd>
          <dt>최소 지원 버전</dt>
          <dd>{connection.report.minimumVersion} 이상 정식 버전</dd>
        </dl>
      )}
      {connection.error && <p role="alert">{connection.error}</p>}
    </>
  );
}
function ConnectionActions({ connection }: Props) {
  return (
    <div className="connection-actions">
      <button
        type="button"
        disabled={connection.busy}
        onClick={() => void connection.run({ kind: "inspect" })}
      >
        상태 다시 확인
      </button>
      <button
        type="button"
        disabled={connection.busy}
        onClick={() => void connection.run({ kind: "select" })}
      >
        설치 경로 변경
      </button>
      <CliRequestActions connection={connection} />
      <p>
        연결 테스트와 AI 요청은 사용 한도를 소비할 수 있습니다. 중단해도 이미
        처리된 사용량은 취소되지 않습니다.
      </p>
    </div>
  );
}
function CliRequestActions({ connection }: Props) {
  return (
    <>
      <button
        type="button"
        disabled={connection.busy}
        onClick={() =>
          void connection.run({
            kind: "login",
            operation_id: crypto.randomUUID(),
          })
        }
      >
        공식 로그인 열기
      </button>
      <button
        type="button"
        disabled={connection.busy || connection.report?.status !== "READY"}
        onClick={() =>
          void connection.run({
            kind: "test",
            operation_id: crypto.randomUUID(),
          })
        }
      >
        연결 테스트
      </button>
      {connection.operation && (
        <button
          type="button"
          disabled={connection.cancelling}
          onClick={() => void connection.cancel()}
        >
          연결 요청 중단
        </button>
      )}
    </>
  );
}
function InstallGuide() {
  const [error, setError] = useState("");
  async function open() {
    try {
      await invoke("open_preview_link", {
        request: { schemaVersion: SCHEMA_VERSION },
        href: "https://code.claude.com/docs/en/setup",
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  return (
    <details>
      <summary>설치·로그인 안내</summary>
      <p>
        공식 설치 안내에 따라 CLI를 설치하세요. 로그인 창이 열리지 않으면
        터미널에서 <code>claude auth login</code>을 실행한 뒤 상태를 다시
        확인하세요.
      </p>
      <button type="button" onClick={() => void open()}>
        공식 설치 안내 열기
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
