ALTER TABLE comments ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE TABLE conflict_snapshots (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    head_version_id TEXT NOT NULL REFERENCES versions(id),
    content_utf8 TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    disk_hash TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX document_conflict_snapshots ON conflict_snapshots(document_id, created_at);
