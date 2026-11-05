ALTER TABLE proposal_batches ADD COLUMN review_mode TEXT NOT NULL DEFAULT 'WHOLE'
    CHECK (review_mode IN ('WHOLE','CHANGES'));
UPDATE proposal_batches SET review_mode='CHANGES' WHERE mode='PATCH';
CREATE TABLE review_plans (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL UNIQUE REFERENCES proposal_batches(id),
    base_version_id TEXT NOT NULL REFERENCES versions(id),
    candidate_hash TEXT NOT NULL,
    algorithm_version INTEGER NOT NULL CHECK (algorithm_version>0),
    created_at INTEGER NOT NULL,
    UNIQUE(id,batch_id)
);
CREATE TABLE review_units (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    number INTEGER NOT NULL CHECK(number>0),
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('addition','deletion','modify','structure','move')),
    reason TEXT NOT NULL,
    review_revision INTEGER NOT NULL DEFAULT 1 CHECK(review_revision>0),
    FOREIGN KEY(plan_id,batch_id) REFERENCES review_plans(id,batch_id),
    UNIQUE(batch_id,number),
    UNIQUE(id,batch_id,plan_id)
);
CREATE TABLE unit_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id),
    batch_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('OPEN','RESOLVED')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    created_at INTEGER NOT NULL,
    FOREIGN KEY(unit_id,batch_id,plan_id) REFERENCES review_units(id,batch_id,plan_id)
);
CREATE INDEX unit_comment_target ON unit_comments(unit_id,created_at,id);
CREATE INDEX unit_comment_task ON unit_comments(task_id,created_at,id);
