CREATE TABLE drafts (
    key TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    revision INTEGER NOT NULL CHECK (revision > 0),
    value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
    updated_at INTEGER NOT NULL
);
