import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./editor/editor.css";

if (import.meta.env.VITE_DOCREVIEW_E2E === "true") {
  await import("@wdio/tauri-plugin");
}
const root = document.getElementById("root");
if (!root) throw new Error("앱 화면을 초기화할 수 없습니다.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
