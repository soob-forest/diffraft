CREATE TABLE rewrite_jobs (
    job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    context_json TEXT NOT NULL CHECK (json_valid(context_json))
);
