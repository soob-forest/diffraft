import { createInterface } from "node:readline";

const mode = process.argv[2];
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
if (mode === "oversized") process.stderr.write("x".repeat(3 * 1024 * 1024));
if (mode === "partial") {
  process.stdout.write('{"id":1');
  process.exit(0);
}
send({ method: "fixture/ready", params: {} });
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (mode === "hang" || mode === "oversized") return;
  send({ method: "fixture/notification", params: {} });
  if (mode === "wrong-id") {
    send({ id: request.id + 1, result: {} });
  } else if (mode === "error") {
    send({
      id: request.id,
      error: { code: -32602, message: "SECRET_FIXTURE" },
    });
  } else if (mode.startsWith("missing-thread")) {
    send({
      id: request.id,
      error: {
        code: mode === "missing-thread-wrong-code" ? -32602 : -32600,
        message: `no rollout found for thread id ${request.params.threadId}${mode === "missing-thread-invalid-id" ? " extra" : ""}`,
        data: "SECRET_FIXTURE",
      },
    });
  } else {
    send({ id: request.id, result: request.params });
  }
});
