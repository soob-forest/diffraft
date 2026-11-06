ALTER TABLE tasks ADD COLUMN name TEXT;
UPDATE tasks SET name=CASE WHEN trim(goal)='' THEN '새 작업' ELSE goal END;
CREATE TABLE first_request_drafts (
    key TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    revision INTEGER NOT NULL CHECK (revision > 0),
    value_json TEXT CHECK (value_json IS NULL OR json_valid(value_json)),
    updated_at INTEGER NOT NULL
);
