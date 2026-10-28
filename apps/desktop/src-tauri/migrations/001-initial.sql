CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    canonical_path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    head_version_id TEXT REFERENCES versions(id) DEFERRABLE INITIALLY DEFERRED,
    disk_hash TEXT NOT NULL,
    encoding TEXT NOT NULL DEFAULT 'UTF-8' CHECK (encoding = 'UTF-8'),
    newline TEXT NOT NULL,
    bom INTEGER NOT NULL CHECK (bom IN (0, 1)),
    common_rules TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'CONFLICT', 'RECOVERY_REQUIRED')),
    created_at INTEGER NOT NULL
);
CREATE TABLE versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    number INTEGER NOT NULL CHECK (number > 0),
    parent_id TEXT REFERENCES versions(id),
    content_utf8 TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    reason TEXT NOT NULL,
    operation_id TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    UNIQUE (document_id, number)
);
CREATE TRIGGER immutable_version_update BEFORE UPDATE ON versions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_VERSION'); END;
CREATE TRIGGER immutable_version_delete BEFORE DELETE ON versions
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_VERSION'); END;
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    goal TEXT NOT NULL,
    pinned_rules TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    summary_version INTEGER NOT NULL DEFAULT 0,
    summary_event_seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE TABLE session_bindings (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    cli_session_id TEXT NOT NULL,
    cwd TEXT NOT NULL,
    cli_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'MISSING', 'REPLACED')),
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_active_session ON session_bindings(task_id) WHERE status = 'ACTIVE';
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    attempt_id TEXT NOT NULL UNIQUE,
    base_version_id TEXT NOT NULL REFERENCES versions(id),
    scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
    status TEXT NOT NULL CHECK (status IN ('CREATED','RUNNING','CANCELLING','SUCCEEDED','FAILED','CANCELLED')),
    error_code TEXT,
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_active_job ON jobs((1)) WHERE status IN ('CREATED','RUNNING','CANCELLING');
CREATE TABLE proposal_batches (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
    mode TEXT NOT NULL CHECK (mode IN ('PATCH','REWRITE')),
    base_version_id TEXT NOT NULL REFERENCES versions(id),
    apply_head_id TEXT NOT NULL REFERENCES versions(id),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED','APPLIED','DISCARDED')),
    summary TEXT NOT NULL,
    candidate_markdown TEXT,
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_active_batch ON proposal_batches(job_id) WHERE status = 'ACTIVE';
CREATE TABLE proposals (
    id TEXT NOT NULL,
    batch_id TEXT NOT NULL REFERENCES proposal_batches(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    group_id TEXT NOT NULL,
    block_anchor TEXT NOT NULL CHECK (json_valid(block_anchor)),
    before_text TEXT NOT NULL,
    after_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('PENDING','ACCEPTED','REJECTED','SUPERSEDED','DISCARDED')),
    validity TEXT NOT NULL CHECK (validity IN ('VALID','STALE','CONFLICT')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (id, revision)
);
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    target_id TEXT,
    target_revision INTEGER,
    anchor_json TEXT NOT NULL CHECK (json_valid(anchor_json)),
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED','NEEDS_VERIFICATION')),
    created_at INTEGER NOT NULL
);
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT','SYSTEM')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (task_id, seq)
);
CREATE TABLE decision_events (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    task_id TEXT REFERENCES tasks(id),
    seq INTEGER NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL CHECK (json_valid(payload)),
    version_id TEXT NOT NULL REFERENCES versions(id),
    created_at INTEGER NOT NULL
);
CREATE TABLE save_operations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    old_hash TEXT NOT NULL,
    new_hash TEXT NOT NULL,
    temp_path TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('PREPARED','COMMITTED','ABORTED','CONFLICT')),
    recovery_payload TEXT NOT NULL CHECK (json_valid(recovery_payload)),
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_prepared_save ON save_operations(document_id) WHERE phase = 'PREPARED';
CREATE INDEX document_versions ON versions(document_id, number);
CREATE INDEX document_tasks ON tasks(document_id, created_at);
CREATE INDEX task_messages ON messages(task_id, seq);
CREATE INDEX pending_proposals ON proposals(batch_id, decision, validity);
