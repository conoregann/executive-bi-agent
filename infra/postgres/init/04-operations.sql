-- Synthetic source-shaped operational records; fixed analytics reader only.
CREATE TABLE IF NOT EXISTS raw.operational_coverage (
 source text NOT NULL CHECK (source IN ('crm','support','usage')),
 month date NOT NULL CHECK (month = date_trunc('month', month)::date),
 status text NOT NULL CHECK (status IN ('complete','incomplete','unavailable','stale')),
 freshness timestamptz NOT NULL,
 PRIMARY KEY (source, month)
);
INSERT INTO raw.operational_coverage (source, month, status, freshness)
SELECT item->>'source', (item->>'month')::date, item->>'status', (item->>'freshness')::timestamptz
FROM jsonb_array_elements((pg_read_file('/fixtures/operations-2026.json')::jsonb)->'coverage') item
ON CONFLICT (source, month) DO NOTHING;
CREATE OR REPLACE VIEW analytics.operational_coverage AS
SELECT source, month, status, freshness FROM raw.operational_coverage;
GRANT SELECT ON analytics.operational_coverage TO executive_bi_analytics;
CREATE TABLE IF NOT EXISTS raw.operational_records (
 record_id text PRIMARY KEY,
 record jsonb NOT NULL CHECK (record->>'source' IN ('crm','support','usage')),
 label text NOT NULL DEFAULT 'synthetic' CHECK (label = 'synthetic')
);
INSERT INTO raw.operational_records (record_id, record)
SELECT item->>'recordId', item
FROM jsonb_array_elements((pg_read_file('/fixtures/operations-2026.json')::jsonb)->'rows') item
ON CONFLICT (record_id) DO UPDATE SET record = EXCLUDED.record;
CREATE OR REPLACE VIEW staging.operational_records AS
SELECT record_id, record->>'customerId' AS customer_id, record->>'source' AS source,
 (record->>'month')::date AS month, record
FROM raw.operational_records;
CREATE OR REPLACE VIEW analytics.operational_records AS
SELECT record_id, customer_id, source, month, record FROM staging.operational_records;
GRANT SELECT ON analytics.operational_records TO executive_bi_analytics;
