CREATE UNIQUE INDEX task_document_identity ON tasks(id, document_id);
CREATE TABLE workspace_selection (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    document_id TEXT NOT NULL REFERENCES documents(id)
);
CREATE TABLE document_selections (
    document_id TEXT PRIMARY KEY REFERENCES documents(id),
    task_id TEXT,
    FOREIGN KEY(task_id, document_id) REFERENCES tasks(id, document_id)
);
