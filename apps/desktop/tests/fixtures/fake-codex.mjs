import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  account,
  catalog,
  configuration,
  disabled,
} from "./fake-codex-settings.mjs";

const mode = process.argv[2];
const args = process.argv.slice(3);
assert.deepEqual(args.slice(0, 2), ["app-server", "--stdio"]);
const overrides = new Map();
for (let index = 2; index < args.length; index += 2) {
  assert.equal(args[index], "-c");
  const pair = args[index + 1];
  const split = pair.indexOf("=");
  assert(split > 0);
  overrides.set(pair.slice(0, split), pair.slice(split + 1));
}
for (const name of disabled)
  assert(overrides.get("features").includes(`"${name}"=false`));
for (const [key, value] of Object.entries({
  web_search: '"disabled"',
  approval_policy: '"never"',
  sandbox_mode: '"read-only"',
  notify: "[]",
  project_doc_max_bytes: "0",
  allow_login_shell: "false",
}))
  assert.equal(overrides.get(key), value);
const restricted = overrides
  .get("mcp_servers")
  .includes('"fixture.server"={"enabled"=false}');
const profile = overrides
  .get("permissions")
  ?.match(/^\{"(docreview-[a-f0-9-]+)"=/)?.[1];
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
let initialized = false;
let thread;
let running;
let generated = false;
let loggedIn = false;
const lines = createInterface({ input: process.stdin });
const handlers = {
  "config/read": (id) =>
    send({ id, result: { config: configuration(restricted) } }),
  "account/read": (id) =>
    send({ id, result: account(mode, generated, loggedIn) }),
  "account/login/start": login,
  "model/list": (id) => send({ id, result: catalog }),
  "skills/list": (id) =>
    send({
      id,
      result: { data: [{ cwd: process.cwd(), skills: [], errors: [] }] },
    }),
  "thread/start": startThread,
  "thread/resume": startThread,
  "turn/start": startTurn,
  "turn/interrupt": interrupt,
};
lines.on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (method === "initialize") {
    initialized = true;
    send({ id, result: {} });
    return;
  }
  assert(initialized);
  if (method === "initialized") return;
  assert(handlers[method], "unsupported fixture RPC");
  handlers[method](id, params);
});

function login(id, params) {
  assert.equal(params.type, "chatgpt");
  send({
    id,
    result: {
      loginId: "fixture-login",
      authUrl:
        mode === "LOGIN_BADURL"
          ? "https://example.invalid"
          : "https://auth.openai.com/authorize?fixture=true",
    },
  });
  loggedIn = true;
  send({
    method: "account/login/completed",
    params: {
      loginId: mode === "LOGIN_MISMATCH" ? "other" : "fixture-login",
      success: true,
    },
  });
}

function startThread(id, params) {
  assert(restricted && profile);
  assert.equal(params.permissions, profile);
  assert.equal(params.modelProvider, "openai");
  assert.equal(params.approvalPolicy, "never");
  assert.equal(params.cwd, process.cwd());
  assert.deepEqual(params.dynamicTools, []);
  assert.deepEqual(params.environments, []);
  assert.equal(params.allowProviderModelFallback, false);
  assert.equal(typeof params.baseInstructions, "string");
  assert(params.baseInstructions.includes("DocReview"));
  assert(params.baseInstructions.includes("Do not read files"));
  if (mode === "RECOVERY_SUCCESS") assert.equal(params.threadId, undefined);
  if (params.threadId && ["SESSION_MISSING", "RESUME_DENIED"].includes(mode)) {
    send({
      id,
      error: {
        code: -32600,
        message:
          mode === "SESSION_MISSING"
            ? `no rollout found for thread id ${params.threadId}`
            : "permission denied: SECRET_FIXTURE",
      },
    });
    return;
  }
  thread = params.threadId ?? `thread_${randomUUID()}`;
  send({
    id,
    result: {
      thread: { id: thread },
      model: params.model,
      modelProvider: "openai",
      cwd: params.cwd,
      approvalPolicy: "never",
      activePermissionProfile: { id: profile },
      instructionSources: [],
    },
  });
}

function interrupt(id, params) {
  assert.equal(params.turnId, running);
  writeFileSync("codex-interrupted", "interrupted");
  send({ id, result: {} });
  send({
    method: "turn/completed",
    params: {
      threadId: thread,
      turn: { id: running, status: "interrupted", items: [], error: null },
    },
  });
}

function startTurn(id, params) {
  verifyRecoveryContext(params);
  assert.equal(params.threadId, thread);
  assert.equal(params.permissions, profile);
  assert.equal(params.approvalPolicy, "never");
  assert.deepEqual(params.environments, []);
  assert(["fixture-codex", "fixture-alt"].includes(params.model));
  assert(["low", "medium"].includes(params.effort));
  assert.equal(params.outputSchema.type, "object");
  writeFileSync(
    "codex-observation.json",
    JSON.stringify({
      model: params.model,
      effort: params.effort,
      thread,
      profile,
    }),
  );
  running = `turn_${randomUUID()}`;
  send({
    id,
    result: { turn: { id: running, status: "inProgress", items: [] } },
  });
  send({
    method: "turn/started",
    params: { threadId: thread, turn: { id: running } },
  });
  writeFileSync("codex-generation-ready", "ready");
  if (mode === "HANG") {
    const timer = setInterval(() => {
      if (existsSync("codex-release")) {
        clearInterval(timer);
        finishTurn(params);
      }
    }, 5);
    return;
  }
  if (failTurn()) return;
  finishTurn(params);
}

function verifyRecoveryContext(params) {
  if (mode !== "RECOVERY_SUCCESS") return;
  const input = JSON.parse(params.input[0].text);
  assert.equal(input.messages.length, 3);
  assert.equal(
    input.messages.filter((message) => message.role === "ASSISTANT").length,
    1,
  );
  assert(
    input.messages.some((message) => message.content === "합성 Codex 설명"),
  );
}

function failTurn() {
  if (mode === "TOOL") {
    send({
      id: "approval",
      method: "item/commandExecution/requestApproval",
      params: {},
    });
    return true;
  }
  if (mode === "LIMIT") {
    send({
      method: "turn/completed",
      params: {
        threadId: thread,
        turn: {
          id: running,
          status: "failed",
          error: {
            codexErrorInfo: "usageLimitExceeded",
            message: "SECRET_FIXTURE",
          },
          items: [],
        },
      },
    });
    return true;
  }
  return false;
}

function finishTurn(params) {
  let input;
  try {
    input = JSON.parse(params.input[0].text);
  } catch {
    input = { mode: "EXPLAIN" };
  }
  const output = response(input);
  const item = {
    type: "agentMessage",
    id: "final",
    phase: "final_answer",
    text: mode === "MALFORMED" ? "{invalid" : JSON.stringify(output),
  };
  const threadId = mode === "WRONG_THREAD" ? "unrelated" : thread;
  send({
    method: "item/completed",
    params: { threadId, turnId: running, item },
  });
  send({
    method: "turn/completed",
    params: {
      threadId,
      turn: { id: running, status: "completed", items: [item], error: null },
    },
  });
  generated = true;
}

function response(input) {
  if (input.mode === "EXPLAIN")
    return { schema_version: 1, mode: "EXPLAIN", answer: "합성 Codex 설명" };
  if (input.mode === "REWRITE")
    return {
      schema_version: 1,
      mode: "REWRITE",
      summary: "합성 재작성",
      candidate_markdown: "# 합성 Codex 후보\n",
    };
  const block = input.target
    ? {
        block_id: input.target.operation.blockId,
        before: input.target.operation.before,
      }
    : (input.scope.blocks.find((item) => item.before.trim()) ??
      input.scope.blocks[0]);
  return {
    schema_version: 1,
    mode: "PATCH",
    summary: "합성 수정",
    changes: [
      {
        block_id: block.block_id,
        before: block.before,
        after: "승인할 합성 Codex 수정",
        reason: "합성 지시 반영",
      },
    ],
  };
}
