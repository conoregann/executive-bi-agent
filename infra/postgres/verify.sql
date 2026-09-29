DO $$
DECLARE
  actual BIGINT;
  fixture JSONB;
  mismatches BIGINT;
BEGIN
  fixture := pg_read_file('/fixtures/subscription-month-2026.json')::jsonb;
  IF fixture->>'label' NOT LIKE 'Synthetic data%' THEN
    RAISE EXCEPTION 'Subscription-month fixture must be labeled synthetic';
  END IF;

  WITH expected_rows AS (
    SELECT value AS row FROM jsonb_array_elements(fixture->'rows')
  ), actual_rows AS (
    SELECT jsonb_build_object(
      'customerId', customer_id,
      'subscriptionId', subscription_id,
      'month', month::text,
      'mrrEurCents', mrr_eur_cents,
      'isActiveAtMonthEnd', is_active_at_month_end,
      'cancelledAt', CASE WHEN cancelled_at IS NULL THEN NULL ELSE to_char(cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
      'plan', plan,
      'country', country,
      'region', region,
      'industry', industry,
      'companySize', company_size
    ) AS row
    FROM analytics.subscription_month
  ), differences AS (
    (SELECT row FROM expected_rows EXCEPT SELECT row FROM actual_rows)
    UNION ALL
    (SELECT row FROM actual_rows EXCEPT SELECT row FROM expected_rows)
  )
  SELECT COUNT(*) INTO mismatches FROM differences;
  IF mismatches <> 0 THEN
    RAISE EXCEPTION 'PostgreSQL subscription-month rows differ from the JSON fixture: % differences', mismatches;
  END IF;

  IF (SELECT COUNT(*) FROM analytics.subscription_month) <> jsonb_array_length(fixture->'rows') THEN
    RAISE EXCEPTION 'PostgreSQL subscription-month row count differs from the JSON fixture';
  END IF;

  IF (SELECT to_char(freshness AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM analytics.subscription_month_freshness) IS DISTINCT FROM fixture->>'freshness' THEN
    RAISE EXCEPTION 'PostgreSQL freshness differs from the JSON fixture';
  END IF;

  SELECT mrr_eur_cents INTO actual
  FROM analytics.mrr_monthly
  WHERE month = DATE '2026-06-01';
  IF actual <> 480000 THEN
    RAISE EXCEPTION 'Expected June MRR 480000 cents, received %', actual;
  END IF;

  SELECT mrr_eur_cents INTO actual
  FROM analytics.mrr_monthly
  WHERE month = DATE '2026-07-01';
  IF actual <> 420000 THEN
    RAISE EXCEPTION 'Expected July MRR 420000 cents, received %', actual;
  END IF;

  SELECT mrr_eur_cents INTO actual
  FROM analytics.mrr_monthly
  WHERE month = DATE '2026-08-01';
  IF actual <> 250000 THEN
    RAISE EXCEPTION 'Expected August MRR 250000 cents, received %', actual;
  END IF;

  SELECT starting_mrr_eur_cents + new_mrr_eur_cents + expansion_mrr_eur_cents - contraction_mrr_eur_cents - churned_mrr_eur_cents - ending_mrr_eur_cents
  INTO actual
  FROM analytics.mrr_movement_monthly
  WHERE month = DATE '2026-08-01';
  IF actual <> 0 THEN
    RAISE EXCEPTION 'August MRR movement did not reconcile; difference is % cents', actual;
  END IF;

  SELECT churned_customers INTO actual
  FROM analytics.mrr_movement_monthly
  WHERE month = DATE '2026-08-01';
  IF actual <> 1 THEN
    RAISE EXCEPTION 'Expected one churned customer in August, received %', actual;
  END IF;

  IF (SELECT COUNT(*) FROM analytics.subscription_month WHERE customer_id = 'cust_berlin' AND month = DATE '2026-06-01') <> 2
    OR (SELECT SUM(mrr_eur_cents) FROM analytics.subscription_month WHERE customer_id = 'cust_berlin' AND month = DATE '2026-06-01') <> 90000 THEN
    RAISE EXCEPTION 'Synthetic multi-subscription customer did not aggregate to 90000 cents';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM analytics.customer_mrr_movement_monthly
    WHERE customer_id = 'cust_berlin' AND month = DATE '2026-07-01'
      AND prior_mrr_eur_cents = 90000 AND current_mrr_eur_cents = 90000
      AND movement_type = 'none' AND plan = 'growth' AND country = 'DE'
  ) THEN
    RAISE EXCEPTION 'Synthetic plan and country transfer was misclassified as customer movement';
  END IF;

  IF (SELECT SUM(mrr_eur_cents) FROM analytics.subscription_month WHERE month = DATE '2026-06-01' AND country = 'GB') <> 140000
    OR (SELECT SUM(mrr_eur_cents) FROM analytics.subscription_month WHERE month = DATE '2026-07-01' AND country = 'GB') <> 50000
    OR (SELECT SUM(mrr_eur_cents) FROM analytics.subscription_month WHERE month = DATE '2026-06-01' AND country = 'DE') <> 240000
    OR (SELECT SUM(mrr_eur_cents) FROM analytics.subscription_month WHERE month = DATE '2026-07-01' AND country = 'DE') <> 330000 THEN
    RAISE EXCEPTION 'Synthetic country transfer does not reconcile across periods';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM analytics.customer_mrr_movement_monthly
    WHERE customer_id = 'cust_nordic' AND month = DATE '2026-08-01'
      AND prior_mrr_eur_cents = 0 AND current_mrr_eur_cents = 60000 AND movement_type = 'new'
  ) THEN
    RAISE EXCEPTION 'Synthetic reactivation did not follow zero-to-positive movement semantics';
  END IF;
END $$;

-- A current-record edit must not alter any historical reporting dimension.
BEGIN;
UPDATE raw.customers SET plan = 'enterprise', country = 'FR' WHERE customer_id = 'cust_berlin';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM analytics.subscription_month
    WHERE customer_id = 'cust_berlin'
      AND ((month = DATE '2026-06-01' AND (plan <> 'starter' OR country <> 'GB' OR region <> 'uk_ireland'))
        OR (month IN (DATE '2026-07-01', DATE '2026-08-01') AND (plan <> 'growth' OR country <> 'DE' OR region <> 'dach')))
  ) THEN
    RAISE EXCEPTION 'Current customer edit rewrote historical reporting dimensions';
  END IF;
END $$;
ROLLBACK;

SELECT 'analytics verification passed' AS result;

DO $$
BEGIN
 IF (SELECT count(*) FROM analytics.operational_records) <> (SELECT jsonb_array_length(pg_read_file('/fixtures/operations-2026.json')::jsonb->'rows')) THEN
 RAISE EXCEPTION 'Synthetic operational fixture parity failed';
 END IF;
 IF EXISTS (SELECT 1 FROM raw.operational_records WHERE label <> 'synthetic') THEN RAISE EXCEPTION 'Missing synthetic label'; END IF;
END $$;

DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(pg_read_file('/fixtures/operations-2026.json')::jsonb->'rows') item
  LEFT JOIN analytics.operational_records actual ON actual.record_id = item->>'recordId'
  WHERE actual.record IS DISTINCT FROM item
 ) THEN RAISE EXCEPTION 'Synthetic operational record parity failed'; END IF;
 IF NOT has_table_privilege('executive_bi_analytics','analytics.operational_records','SELECT')
 OR has_table_privilege('executive_bi_analytics','raw.operational_records','SELECT') THEN
 RAISE EXCEPTION 'Operational reader permission boundary failed'; END IF;
END $$;
