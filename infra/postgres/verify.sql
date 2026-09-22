DO $$
DECLARE
  actual BIGINT;
BEGIN
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
