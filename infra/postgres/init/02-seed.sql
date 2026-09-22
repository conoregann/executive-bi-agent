INSERT INTO raw.customers (customer_id, customer_name, industry, country, company_size, plan, acquisition_channel, account_owner, created_at) VALUES
  ('cust_acme', 'Acme Industrial', 'manufacturing', 'DE', 'enterprise', 'enterprise', 'sales_outbound', 'Marta Fischer', '2025-02-10T09:00:00Z'),
  ('cust_berlin', 'Berlin Legal', 'professional_services', 'DE', 'mid_market', 'growth', 'partner', 'Jonas Weber', '2025-04-18T09:00:00Z'),
  ('cust_london', 'London Retail Group', 'retail', 'GB', 'enterprise', 'enterprise', 'sales_outbound', 'Amelia Smith', '2025-01-12T09:00:00Z'),
  ('cust_nordic', 'Nordic Ventures', 'technology', 'SE', 'small', 'starter', 'product_led', 'Lina Berg', '2026-08-05T09:00:00Z'),
  ('cust_riviera', 'Riviera Advisory', 'financial_services', 'FR', 'mid_market', 'growth', 'paid_search', 'Claire Martin', '2025-06-02T09:00:00Z');

INSERT INTO raw.subscription_month_snapshots (customer_id, subscription_id, month, mrr_eur_cents, subscription_status) VALUES
  ('cust_acme', 'sub_acme', '2026-07-01', 240000, 'active'), ('cust_berlin', 'sub_berlin', '2026-07-01', 90000, 'active'),
  ('cust_london', 'sub_london', '2026-07-01', 50000, 'active'), ('cust_nordic', 'sub_nordic', '2026-07-01', 0, 'cancelled'),
  ('cust_riviera', 'sub_riviera', '2026-07-01', 40000, 'active'), ('cust_acme', 'sub_acme', '2026-08-01', 0, 'cancelled'),
  ('cust_berlin', 'sub_berlin', '2026-08-01', 110000, 'active'), ('cust_london', 'sub_london', '2026-08-01', 50000, 'active'),
  ('cust_nordic', 'sub_nordic', '2026-08-01', 60000, 'active'), ('cust_riviera', 'sub_riviera', '2026-08-01', 30000, 'active');

INSERT INTO raw.support_tickets (ticket_id, customer_id, category, priority, status, opened_at, resolved_at, csat) VALUES
  ('ticket_281', 'cust_acme', 'payments', 'urgent', 'resolved', '2026-08-14T08:30:00Z', '2026-08-16T18:00:00Z', 2),
  ('ticket_282', 'cust_berlin', 'billing', 'normal', 'resolved', '2026-08-19T10:00:00Z', '2026-08-20T15:00:00Z', 4);

INSERT INTO raw.company_documents (document_id, document_type, department, title, occurred_on, customer_id, relative_path, confidentiality) VALUES
  ('doc_incident_281', 'incident_postmortem', 'engineering', 'Payment provider incident #281', '2026-08-16', NULL, 'data/synthetic/knowledge/2026-08-payment-incident-281.md', 'internal'),
  ('doc_sales_august', 'sales_review', 'sales', 'August sales review', '2026-08-31', 'cust_acme', 'data/synthetic/knowledge/2026-08-sales-review.md', 'internal');
