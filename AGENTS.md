# Executive BI Agent Guide

Behavioral guidelines and non-negotiable system invariants. Bias toward caution over speed.

---

## 1. Core Operating Rules

### 1. Think Before Coding
**Don’t assume. Don’t hide confusion. Surface tradeoffs.**
- Read the affected interface, tests, and governing contract before editing.
- State assumptions explicitly. If an architectural choice is open, ask before building.
- If multiple interpretations exist, present them—never pick silently.
- Push back if a simpler approach exists. Stop and ask if requirements are ambiguous.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- Build only what was requested. No speculative layers, abstractions, or "future-proofing."
- Do not introduce infrastructure, vector stores, providers, or dependencies until an active capability strictly requires them.
- Documentation is a tool, not a gate: update it only when contracts, metrics, safety boundaries, or architectural decisions change. Keep it short.
- *Senior engineer test:* If you wrote 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Do not "improve" adjacent code, comments, or formatting.
- Match existing style. Do not refactor code that is not broken.
- Clean up imports, variables, or functions orphaned by *your* changes. Leave pre-existing dead code alone (mention it instead).
- Every changed line must trace directly to the requested outcome.

### 4. Goal-Driven Execution
**Define success criteria. Verify before declaring done.**
- Convert tasks into verifiable checks:
  - *"Fix metric query"* $\to$ write a failing test reproducing the issue, then pass it.
  - *"Add API endpoint"* $\to$ add schema validation test, run against synthetic fixture.
- Multi-step tasks require a brief plan:
  ```
  1. [Step] -> verify: [check]
  2. [Step] -> verify: [check]
  ```

---

## 2. Non-Negotiable Domain & Security Invariants

These rules override convenience. Never bypass them:

- **Deterministic Metrics Only:** Metrics are centrally defined in code. **Never** calculate or infer MRR, ARR, revenue, churn, CAC, LTV, retention, or conversion from raw model text.
- **SQL is Hostile Input:** 
  - Read-only access only. Zero write statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`).
  - Strict schema whitelisting, mandatory statement timeouts, and row limits.
- **Separate Analytics from Knowledge Retrieval:** Keep structured data and document retrieval isolated. Connect them only through inspectable, cited evidence.
- **Inspectable Claims:** Material claims must state their source, freshness, scope, and integrity. Plainly flag missing, stale, conflicting, or correlational data.
- **Synthetic Data Labeling:** All fixtures and local seeds must be explicitly labeled `synthetic`. Never simulate or claim access to real production customer data.
- **Deterministic Tools Over Agentic Guessing:** Prefer typed, bounded function calls over freeform model reasoning.

---

## 3. Layout Boundaries

Stay strictly within layer responsibilities:

| Path | Responsibility | Rule |
| :--- | :--- | :--- |
| `apps/` | Deployable web, API, worker surfaces | No domain business logic here. |
| `packages/` | Shared domain capabilities & typed contracts | Metrics and core logic live here. |
| `data/` | Synthetic source data and fixtures | **Synthetic data only.** No real PII/customer data. |
| `evals/` | Acceptance test cases & safety checks | Add evals when user-facing behavior changes. |
| `docs/` | Canonical contracts and ADRs | Concise. No duplicate implementation walkthroughs. |
| `infra/` | Cloud and deployment definitions | Touch only when a shipped capability requires it. |

---

## 4. Delivery & Verification Loop

Follow this loop for every capability:

1. **Locate Contract:** Identify the narrowest governing contract (`packages/...`). Update it first if the interface changes.
2. **Implement & Test:** Implement the change along with its failure paths.
   - Update/add a **targeted test** for any invariant or behavior change.
   - Update/add an **eval** for any agent prompt/investigation change.
3. **Run Validation:**
   ```bash
   # Iterative check
   pnpm test:targeted <file>

   # Pre-handoff suite
   pnpm format:check
   pnpm check
   pnpm test
   git diff --check
   ```
4. **Clean Diff:** Verify no stray files, unintended formatting changes, or leaked credentials exist.

---

## 5. Git & Handoff Rules

- **Branching:** Base off `main`. Use `feat/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- **Branch Scope:** Keep the branch open across sessions until the capability is complete (code + tests + contracts). Do not spawn new branches as a substitute for task management.
- **History Preservation:** Never force-push or discard work without explicit instruction. Preserve unrelated working-tree modifications.
- **Commits:** Write Conventional Commits (`feat: ...`, `fix: ...`).
- **Handoff Output:** In your final response, explicitly state:
  1. Summary of changes made.
  2. Verification commands run and their results.
  3. Any known environmental blockers or assumptions made.

---

## Definition of Done

A change is complete **only** when:
- [ ] The requested outcome functions as specified.
- [ ] Metric calculations and SQL execution strictly follow security invariants.
- [ ] Targeted tests and `pnpm check` pass.
- [ ] Diff is minimal, surgical, and contains zero speculative code.