# Evaluations Guide

Evaluation files are durable acceptance criteria, not informal notes. Keep each
case deterministic, concise, and tied to a contract under `docs/`.

- Specify inputs or fixture conditions, the expected outcome, and prohibited
  behavior when it protects a safety or evidence boundary.
- Cover correctness and failure modes: invalid input, unavailable data, scope
  leakage, non-reconciliation, and unsupported causal claims as applicable.
- Do not weaken or delete a case to accommodate an implementation regression.
  Change an evaluation only with the corresponding approved contract change.
- Use stable identifiers and concrete expected values where the fixture permits.

When adding behavior, update the closest package test as well as the relevant
evaluation if it represents a durable acceptance rule.
