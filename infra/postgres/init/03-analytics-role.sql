-- Dedicated reader for the local synthetic analytics dataset only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'executive_bi_analytics') THEN
    CREATE ROLE executive_bi_analytics LOGIN PASSWORD 'synthetic_analytics_local_only';
  END IF;
END
$$;
ALTER ROLE executive_bi_analytics SET default_transaction_read_only = on;
ALTER ROLE executive_bi_analytics SET statement_timeout = '5s';
GRANT USAGE ON SCHEMA analytics TO executive_bi_analytics;
GRANT SELECT ON analytics.subscription_month, analytics.subscription_month_freshness, analytics.subscription_month_coverage TO executive_bi_analytics;
