BEGIN;

CREATE TABLE IF NOT EXISTS raw.source_snapshots (
  source TEXT PRIMARY KEY,
  freshness TIMESTAMPTZ NOT NULL
);

INSERT INTO raw.source_snapshots (source, freshness) VALUES
  ('analytics.subscription_month', '2026-09-01T08:00:00Z')
ON CONFLICT (source) DO UPDATE SET freshness = EXCLUDED.freshness;

ALTER TABLE raw.subscription_month_snapshots
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE raw.subscription_month_snapshots
SET cancelled_at = '2026-08-12T10:00:00Z'
WHERE customer_id = 'cust_acme'
  AND subscription_id = 'sub_acme'
  AND month = DATE '2026-08-01'
  AND cancelled_at IS NULL;

CREATE OR REPLACE VIEW staging.subscription_month_snapshots AS
SELECT
  snapshot.customer_id,
  snapshot.subscription_id,
  snapshot.month,
  snapshot.mrr_eur_cents,
  snapshot.subscription_status,
  customer.plan,
  customer.country,
  customer.region,
  customer.industry,
  customer.company_size,
  snapshot.cancelled_at
FROM raw.subscription_month_snapshots AS snapshot
JOIN staging.customers AS customer USING (customer_id);

CREATE OR REPLACE VIEW analytics.subscription_month AS
SELECT
  customer_id,
  subscription_id,
  month,
  mrr_eur_cents,
  mrr_eur_cents > 0 AS is_active_at_month_end,
  plan,
  country,
  region,
  industry,
  company_size,
  cancelled_at
FROM staging.subscription_month_snapshots;

CREATE OR REPLACE VIEW analytics.subscription_month_freshness AS
SELECT freshness
FROM raw.source_snapshots
WHERE source = 'analytics.subscription_month';

\ir init/02-investigations.sql

COMMIT;
