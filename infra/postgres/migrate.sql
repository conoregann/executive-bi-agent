BEGIN;

CREATE TABLE IF NOT EXISTS raw.source_snapshots (
  source TEXT PRIMARY KEY,
  freshness TIMESTAMPTZ NOT NULL
);

INSERT INTO raw.source_snapshots (source, freshness) VALUES
  ('analytics.subscription_month', '2026-09-01T08:00:00Z')
ON CONFLICT (source) DO UPDATE SET freshness = EXCLUDED.freshness;

CREATE TABLE IF NOT EXISTS raw.subscription_month_coverage (
  month DATE PRIMARY KEY CHECK (month = date_trunc('month', month)::DATE),
  status TEXT NOT NULL CHECK (status IN ('complete', 'incomplete', 'unavailable', 'stale')),
  freshness TIMESTAMPTZ NOT NULL
);
INSERT INTO raw.subscription_month_coverage (month, status, freshness) VALUES
  ('2026-06-01', 'complete', '2026-09-01T08:00:00Z'),
  ('2026-07-01', 'complete', '2026-09-01T08:00:00Z'),
  ('2026-08-01', 'complete', '2026-09-01T08:00:00Z')
ON CONFLICT (month) DO NOTHING;
CREATE OR REPLACE VIEW analytics.subscription_month_coverage AS
SELECT month, status, freshness FROM raw.subscription_month_coverage;

ALTER TABLE raw.subscription_month_snapshots
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

UPDATE raw.customers SET created_at = '2026-05-05T09:00:00Z'
WHERE customer_id = 'cust_nordic' AND created_at = '2026-08-05T09:00:00Z';

UPDATE raw.subscription_month_snapshots
SET cancelled_at = '2026-08-12T10:00:00Z'
WHERE customer_id = 'cust_acme'
  AND subscription_id = 'sub_acme'
  AND month = DATE '2026-08-01'
  AND cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS raw.customer_month_dimensions (
  customer_id TEXT NOT NULL REFERENCES raw.customers(customer_id),
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::DATE),
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'growth', 'enterprise')),
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  industry TEXT NOT NULL,
  company_size TEXT NOT NULL CHECK (company_size IN ('small', 'mid_market', 'enterprise')),
  PRIMARY KEY (customer_id, month)
);

-- Backfill the known synthetic history explicitly; mutable customer fields cannot reconstruct it.
INSERT INTO raw.customer_month_dimensions (customer_id, month, plan, country, industry, company_size) VALUES
  ('cust_acme', '2026-06-01', 'enterprise', 'DE', 'manufacturing', 'enterprise'),
  ('cust_berlin', '2026-06-01', 'starter', 'GB', 'professional_services', 'mid_market'),
  ('cust_london', '2026-06-01', 'enterprise', 'GB', 'retail', 'enterprise'),
  ('cust_nordic', '2026-06-01', 'starter', 'SE', 'technology', 'small'),
  ('cust_riviera', '2026-06-01', 'growth', 'FR', 'financial_services', 'mid_market'),
  ('cust_acme', '2026-07-01', 'enterprise', 'DE', 'manufacturing', 'enterprise'),
  ('cust_berlin', '2026-07-01', 'growth', 'DE', 'professional_services', 'mid_market'),
  ('cust_london', '2026-07-01', 'enterprise', 'GB', 'retail', 'enterprise'),
  ('cust_nordic', '2026-07-01', 'starter', 'SE', 'technology', 'small'),
  ('cust_riviera', '2026-07-01', 'growth', 'FR', 'financial_services', 'mid_market'),
  ('cust_acme', '2026-08-01', 'enterprise', 'DE', 'manufacturing', 'enterprise'),
  ('cust_berlin', '2026-08-01', 'growth', 'DE', 'professional_services', 'mid_market'),
  ('cust_london', '2026-08-01', 'enterprise', 'GB', 'retail', 'enterprise'),
  ('cust_nordic', '2026-08-01', 'starter', 'SE', 'technology', 'small'),
  ('cust_riviera', '2026-08-01', 'growth', 'FR', 'financial_services', 'mid_market')
ON CONFLICT (customer_id, month) DO NOTHING;

INSERT INTO raw.subscription_month_snapshots (customer_id, subscription_id, month, mrr_eur_cents, subscription_status, cancelled_at) VALUES
  ('cust_acme', 'sub_acme', '2026-06-01', 240000, 'active', NULL),
  ('cust_berlin', 'sub_berlin', '2026-06-01', 70000, 'active', NULL),
  ('cust_berlin', 'sub_berlin_extra', '2026-06-01', 20000, 'active', NULL),
  ('cust_london', 'sub_london', '2026-06-01', 50000, 'active', NULL),
  ('cust_nordic', 'sub_nordic', '2026-06-01', 60000, 'active', NULL),
  ('cust_riviera', 'sub_riviera', '2026-06-01', 40000, 'active', NULL)
ON CONFLICT (customer_id, subscription_id, month) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_month_dimensions_fk') THEN
    ALTER TABLE raw.subscription_month_snapshots
      ADD CONSTRAINT subscription_month_dimensions_fk
      FOREIGN KEY (customer_id, month) REFERENCES raw.customer_month_dimensions(customer_id, month);
  END IF;
END $$;

CREATE OR REPLACE VIEW staging.subscription_month_snapshots AS
SELECT
  snapshot.customer_id,
  snapshot.subscription_id,
  snapshot.month,
  snapshot.mrr_eur_cents,
  snapshot.subscription_status,
  dimension.plan,
  dimension.country,
  CASE
    WHEN dimension.country IN ('GB', 'IE') THEN 'uk_ireland'
    WHEN dimension.country IN ('DE', 'AT', 'CH') THEN 'dach'
    WHEN dimension.country IN ('DK', 'FI', 'NO', 'SE') THEN 'nordics'
    WHEN dimension.country IN ('CA', 'US') THEN 'north_america'
    ELSE 'rest_of_europe'
  END AS region,
  dimension.industry,
  dimension.company_size,
  snapshot.cancelled_at
FROM raw.subscription_month_snapshots AS snapshot
JOIN raw.customer_month_dimensions AS dimension
  ON dimension.customer_id = snapshot.customer_id AND dimension.month = snapshot.month;

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
\ir init/03-analytics-role.sql

\ir init/04-operations.sql
\ir init/05-access.sql

COMMIT;
