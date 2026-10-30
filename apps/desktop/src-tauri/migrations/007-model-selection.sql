ALTER TABLE job_executions ADD COLUMN requested_model TEXT
    CHECK (requested_model IN ('cli_default','sonnet','opus','haiku'));
