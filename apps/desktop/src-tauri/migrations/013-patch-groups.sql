CREATE TABLE patch_reviews (
    batch_id TEXT PRIMARY KEY REFERENCES proposal_batches(id),
    policy_version INTEGER NOT NULL CHECK (policy_version > 0),
    revision INTEGER NOT NULL CHECK (revision > 0),
    reasons_json TEXT NOT NULL CHECK (json_valid(reasons_json))
);
