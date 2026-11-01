CREATE TABLE job_executions_v8 (
    job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    mode TEXT NOT NULL CHECK (mode IN ('PATCH','REWRITE','EXPLAIN')),
    requested_session_id TEXT,
    response_session_id TEXT,
    cwd TEXT NOT NULL,
    cli_version TEXT NOT NULL,
    retry_of TEXT REFERENCES jobs(id),
    requested_model TEXT CHECK (
        requested_model IN ('cli_default','sonnet','opus','haiku') OR
        COALESCE(CASE WHEN json_valid(requested_model) THEN
            json_type(requested_model)='object' AND
            json_extract(requested_model,'$.provider')='codex' AND
            json_type(requested_model,'$.model')='text' AND
            json_type(requested_model,'$.effort')='text'
        ELSE 0 END, 0)
    )
);
INSERT INTO job_executions_v8 SELECT * FROM job_executions;
DROP TABLE job_executions;
ALTER TABLE job_executions_v8 RENAME TO job_executions;
CREATE TABLE ai_preferences (
    id INTEGER PRIMARY KEY CHECK (id=1),
    provider TEXT NOT NULL CHECK (provider IN ('claude','codex')),
    codex_model TEXT CHECK (codex_model IS NULL OR json_valid(codex_model)),
    codex_path TEXT
);
CREATE TABLE codex_execution_scopes (
    job_id TEXT PRIMARY KEY REFERENCES job_executions(job_id),
    account_scope TEXT NOT NULL CHECK (length(account_scope)=64)
);
CREATE TABLE codex_sessions (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    account_scope TEXT NOT NULL CHECK (length(account_scope)=64),
    thread_id TEXT NOT NULL,
    cwd TEXT NOT NULL,
    cli_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','MISSING')),
    PRIMARY KEY (task_id,account_scope),
    UNIQUE (account_scope,thread_id)
);
