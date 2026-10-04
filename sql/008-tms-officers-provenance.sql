-- Migration 008: office bearers imported from the archive need the same
-- provenance columns as every other imported table. Safe to re-run.

alter table trust_officers add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
alter table trust_officers add column if not exists content_fingerprint text;
create unique index if not exists uq_trust_officers_fingerprint on trust_officers (content_fingerprint);
