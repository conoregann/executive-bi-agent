# Packages Guide

These packages are small, dependency-light domain boundaries. Keep public APIs
explicit, typed, and deterministic. Do not add a dependency or cross-package
coupling without an active requirement.

Before changing an exported type or behavior, inspect direct consumers, package
tests, and the matching contract under `docs/`. Prefer additive changes unless a
contract change is explicitly requested. Keep runtime packages free of UI,
network, database credentials, and model-provider concerns unless their own
directory contract explicitly permits them.

Validate untrusted inputs at the public boundary. Return typed failure outcomes
where the existing API does so; do not turn expected invalid requests into
uncaught exceptions. Keep evidence immutable in the returned result.

Verify with:

```bash
pnpm --filter @executive-bi/<package> check
pnpm --filter @executive-bi/<package> test
```
