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
