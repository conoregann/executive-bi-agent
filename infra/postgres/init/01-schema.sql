CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE raw.customers (
  customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  company_size TEXT NOT NULL CHECK (company_size IN ('small', 'mid_market', 'enterprise')),
  plan TEXT NOT NULL CHECK (plan IN ('starter', 'growth', 'enterprise')),
  acquisition_channel TEXT NOT NULL,
  account_owner TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE raw.subscription_month_snapshots (
  customer_id TEXT NOT NULL REFERENCES raw.customers(customer_id),
  subscription_id TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::DATE),
  mrr_eur_cents BIGINT NOT NULL CHECK (mrr_eur_cents >= 0),
  subscription_status TEXT NOT NULL CHECK (subscription_status IN ('active', 'cancelled')),
  PRIMARY KEY (customer_id, subscription_id, month)
);

CREATE TABLE raw.support_tickets (
  ticket_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES raw.customers(customer_id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'resolved')),
  opened_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  csat SMALLINT CHECK (csat BETWEEN 1 AND 5)
);

CREATE TABLE raw.company_documents (
  document_id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL,
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  occurred_on DATE NOT NULL,
  customer_id TEXT REFERENCES raw.customers(customer_id),
  relative_path TEXT NOT NULL UNIQUE,
  confidentiality TEXT NOT NULL CHECK (confidentiality IN ('internal', 'restricted'))
);

CREATE VIEW staging.customers AS
SELECT
  customer_id,
  customer_name,
  industry,
  country,
  CASE
    WHEN country IN ('GB', 'IE') THEN 'uk_ireland'
    WHEN country IN ('DE', 'AT', 'CH') THEN 'dach'
    WHEN country IN ('DK', 'FI', 'NO', 'SE') THEN 'nordics'
    WHEN country IN ('CA', 'US') THEN 'north_america'
    ELSE 'rest_of_europe'
  END AS region,
  company_size,
  plan,
  acquisition_channel,
  account_owner,
  created_at
FROM raw.customers;

CREATE VIEW staging.subscription_month_snapshots AS
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
  customer.company_size
FROM raw.subscription_month_snapshots AS snapshot
JOIN staging.customers AS customer USING (customer_id);

CREATE VIEW analytics.subscription_month AS
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
  company_size
FROM staging.subscription_month_snapshots;

CREATE VIEW analytics.mrr_monthly AS
SELECT
  month,
  SUM(mrr_eur_cents) FILTER (WHERE is_active_at_month_end) AS mrr_eur_cents,
  COUNT(DISTINCT customer_id) FILTER (WHERE is_active_at_month_end) AS active_customers
FROM analytics.subscription_month
GROUP BY month;

CREATE VIEW analytics.customer_mrr_movement_monthly AS
WITH customer_month AS (
  SELECT
    month,
    customer_id,
    MAX(plan) AS plan,
    MAX(country) AS country,
    MAX(region) AS region,
    MAX(industry) AS industry,
    MAX(company_size) AS company_size,
    SUM(mrr_eur_cents) AS customer_mrr_eur_cents
  FROM analytics.subscription_month
  GROUP BY month, customer_id
)
SELECT
  current_month.month,
  current_month.customer_id,
  current_month.plan,
  current_month.country,
  current_month.region,
  current_month.industry,
  current_month.company_size,
  previous_month.customer_mrr_eur_cents AS prior_mrr_eur_cents,
  current_month.customer_mrr_eur_cents AS current_mrr_eur_cents,
  CASE
    WHEN previous_month.customer_mrr_eur_cents = 0 AND current_month.customer_mrr_eur_cents > 0 THEN 'new'
    WHEN previous_month.customer_mrr_eur_cents > 0 AND current_month.customer_mrr_eur_cents > previous_month.customer_mrr_eur_cents THEN 'expansion'
    WHEN previous_month.customer_mrr_eur_cents > 0 AND current_month.customer_mrr_eur_cents > 0 AND current_month.customer_mrr_eur_cents < previous_month.customer_mrr_eur_cents THEN 'contraction'
    WHEN previous_month.customer_mrr_eur_cents > 0 AND current_month.customer_mrr_eur_cents = 0 THEN 'churn'
    ELSE 'none'
  END AS movement_type
FROM customer_month AS current_month
JOIN customer_month AS previous_month
  ON previous_month.customer_id = current_month.customer_id
 AND previous_month.month = (current_month.month - INTERVAL '1 month')::DATE;

CREATE VIEW analytics.mrr_movement_monthly AS
SELECT
  month,
  SUM(prior_mrr_eur_cents) AS starting_mrr_eur_cents,
  SUM(current_mrr_eur_cents) AS ending_mrr_eur_cents,
  SUM(current_mrr_eur_cents) FILTER (WHERE movement_type = 'new') AS new_mrr_eur_cents,
  SUM(current_mrr_eur_cents - prior_mrr_eur_cents) FILTER (WHERE movement_type = 'expansion') AS expansion_mrr_eur_cents,
  SUM(prior_mrr_eur_cents - current_mrr_eur_cents) FILTER (WHERE movement_type = 'contraction') AS contraction_mrr_eur_cents,
  SUM(prior_mrr_eur_cents) FILTER (WHERE movement_type = 'churn') AS churned_mrr_eur_cents,
  COUNT(*) FILTER (WHERE prior_mrr_eur_cents > 0) AS starting_customers,
  COUNT(*) FILTER (WHERE movement_type = 'churn') AS churned_customers
FROM analytics.customer_mrr_movement_monthly
GROUP BY month;
