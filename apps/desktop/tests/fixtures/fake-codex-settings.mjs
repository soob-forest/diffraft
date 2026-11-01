export const disabled = [
  "shell_tool",
  "shell_snapshot",
  "apps",
  "plugins",
  "hooks",
  "browser_use",
  "computer_use",
  "multi_agent",
  "multi_agent_v2",
  "view_image",
  "skill_search",
  "tool_suggest",
  "memories",
  "code_mode",
  "code_mode_host",
  "js_repl",
  "image_generation",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "artifact",
  "in_app_local_automation",
  "in_app_browser",
  "multi_env_copy_file",
  "workspace_dependencies",
  "skill_mcp_dependency_install",
  "request_permissions_tool",
  "unified_exec",
  "goals",
  "sleep_tool",
];

export const catalog = {
  data: ["fixture-codex", "fixture-alt"].map((model, index) => ({
    id: model,
    model,
    displayName: model,
    hidden: false,
    isDefault: index === 0,
    defaultReasoningEffort: "low",
    supportedReasoningEfforts: [
      { reasoningEffort: "low" },
      { reasoningEffort: "medium" },
    ],
  })),
  nextCursor: null,
};

export const account = (mode, generated, loggedIn) => ({
  account:
    mode === "AUTH_REQUIRED" || (mode.startsWith("LOGIN") && !loggedIn)
      ? null
      : {
          type: mode === "APIKEY" ? "apiKey" : "chatgpt",
          email: "fixture@example.invalid",
        },
  requiresOpenaiAuth: true,
  workspaceRouting: {
    chatgptAccountId:
      mode === "ACCOUNT_CHANGED" && generated ? "other" : "fixture",
    backendOrigin: "https://chatgpt.com",
  },
});

export function configuration(restricted) {
  return {
    features: {
      ...Object.fromEntries(disabled.map((key) => [key, false])),
      skip_host_skill_discovery: true,
    },
    mcp_servers: { "fixture.server": { enabled: !restricted } },
    web_search: "disabled",
    approval_policy: "never",
    sandbox_mode: "read-only",
    notify: [],
    project_doc_max_bytes: 0,
    allow_login_shell: false,
  };
}
