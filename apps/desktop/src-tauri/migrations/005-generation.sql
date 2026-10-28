CREATE TABLE generation_jobs (
    job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    context_json TEXT NOT NULL CHECK (json_valid(context_json))
);
CREATE TABLE job_executions (
    job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    mode TEXT NOT NULL CHECK (mode IN ('PATCH','REWRITE','EXPLAIN')),
    requested_session_id TEXT,
    response_session_id TEXT,
    cwd TEXT NOT NULL,
    cli_version TEXT NOT NULL,
    retry_of TEXT REFERENCES jobs(id)
);
ALTER TABLE messages ADD COLUMN job_id TEXT REFERENCES jobs(id);
CREATE UNIQUE INDEX one_message_per_job_role ON messages(job_id,role) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX session_owner ON session_bindings(cli_session_id);
