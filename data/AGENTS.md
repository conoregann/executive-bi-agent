# Synthetic Data Guide

All content under `data/` is synthetic test and development data. Keep that
label clear in new fixtures, generators, and knowledge documents.

- Never add real customers, employees, credentials, or production exports.
- Keep fixture identifiers stable unless the matching tests, SQL seeds, and
  documentation are updated in the same change.
- Preserve canonical formats: monetary values are integer EUR cents; reporting
  months are first-of-month UTC dates; customer IDs are explicit and consistent
  across structured and knowledge fixtures.
- Design changes must support a documented contract or evaluation case, including
  negative and missing-data cases where relevant.

When changing seeded data, run the affected package tests and `pnpm db:verify`.
