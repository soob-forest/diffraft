import { spawn } from "node:child_process";

const mode = process.argv[2];
const CHUNK_SIZE = 64 * 1024;
const WAIT_MS = 60_000;

if (mode === "echo") {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(JSON.stringify({ input }));
} else if (mode === "flood") {
  process.stderr.write("x".repeat(CHUNK_SIZE));
  setInterval(() => process.stdout.write("x".repeat(CHUNK_SIZE)), 1);
} else if (mode === "wait") {
  setTimeout(() => {}, WAIT_MS);
} else if (mode === "tree") {
  const child = spawn(process.execPath, [import.meta.filename, "wait"], {
    stdio: "ignore",
  });
  process.stdout.write(String(child.pid));
  setTimeout(() => {}, WAIT_MS);
} else if (mode === "invalid") {
  process.stdout.write("not-json");
  process.exitCode = 1;
} else {
  process.stderr.write("unknown fixture mode");
  process.exitCode = 2;
}
