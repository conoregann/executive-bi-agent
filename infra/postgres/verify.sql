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

  WITH expected AS (
    SELECT value AS row FROM jsonb_array_elements(fixture->'coverage')
  ), actual AS (
    SELECT jsonb_build_object('month', month::text, 'status', status,
      'freshness', to_char(freshness AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) AS row
    FROM analytics.subscription_month_coverage
  ), differences AS (
    (SELECT row FROM expected EXCEPT SELECT row FROM actual)
    UNION ALL
    (SELECT row FROM actual EXCEPT SELECT row FROM expected)
  )
  SELECT COUNT(*) INTO mismatches FROM differences;
  IF mismatches <> 0 OR (SELECT COUNT(*) FROM analytics.subscription_month_coverage) <> jsonb_array_length(fixture->'coverage') THEN
    RAISE EXCEPTION 'PostgreSQL coverage differs from the JSON fixture';
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
END $$;

SELECT 'analytics verification passed' AS result;

DO $$
BEGIN
 IF NOT has_table_privilege('executive_bi_analytics','analytics.subscription_month_coverage','SELECT')
 OR has_table_privilege('executive_bi_analytics','raw.subscription_month_coverage','SELECT') THEN
 RAISE EXCEPTION 'Coverage reader permission boundary failed'; END IF;
END $$;

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
 IF EXISTS (
  WITH expected AS (SELECT item FROM jsonb_array_elements(pg_read_file('/fixtures/operations-2026.json')::jsonb->'coverage') item),
  actual AS (SELECT jsonb_build_object('source',source,'month',month::text,'status',status,'freshness',to_char(freshness AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) item FROM analytics.operational_coverage)
  (SELECT item FROM expected EXCEPT SELECT item FROM actual)
  UNION ALL
  (SELECT item FROM actual EXCEPT SELECT item FROM expected)
 ) THEN RAISE EXCEPTION 'Synthetic operational coverage parity failed'; END IF;
 IF NOT has_table_privilege('executive_bi_analytics','analytics.operational_records','SELECT')
 OR NOT has_table_privilege('executive_bi_analytics','analytics.operational_coverage','SELECT')
 OR has_table_privilege('executive_bi_analytics','raw.operational_records','SELECT')
 OR has_table_privilege('executive_bi_analytics','raw.operational_coverage','SELECT') THEN
 RAISE EXCEPTION 'Operational reader permission boundary failed'; END IF;
END $$;
