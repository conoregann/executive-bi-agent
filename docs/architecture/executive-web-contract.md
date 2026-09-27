# Executive MRR web interface

## Scope

`apps/web` is a React/Vite interface for the existing structured synthetic
MRR-decline API. It does not interpret natural-language questions or calculate
metrics. Routes are explicit API paths; there is no filesystem URL routing.

The form accepts a reporting month and an optional comma-separated list of at
most 50 unique customer IDs. Empty scope means the full synthetic dataset, not
production permission discovery. August 2026 supports comparison against July;
missing comparison evidence produces a blocked outcome. Each submission uses a
new investigation identifier.

## Answers and evidence

The interface validates responses with shared schemas and presents the answer,
drivers, context, limitations, evidence, and recommended next step in order.
It shows the resolved month, previous-month comparison, and customer scope.
Every supplied claim citation opens the authenticated evidence route. Evidence
shows source references, scope, freshness, integrity, and supporting content.
Document excerpts are rendered as text and cannot execute markup.

Bearer tokens live only in page memory. They never enter URLs or browser
storage. Reloading clears access; a new submission clears the previous result.
Only the latest evidence request may update the evidence panel. Reads use
`no-store`; the API also marks responses `no-store`.

## Deployment boundary and failures

Local Vite development proxies `/v1/investigations` to the fixed separate Node API
at `http://127.0.0.1:3001`. Production hosting must serve the built assets and
proxy that same prefix to the API; Vite's development server is not a production
backend. No upstream destination is accepted from browser input.

Submission and evidence loading states are announced. Invalid form scope,
blocked evidence, unavailable services, and failed evidence reads have visible
outcomes that allow retry. Inputs and citations support keyboard use and narrow
screens. Synthetic data labeling remains visible.

Natural-language resolution, new metrics, charts, SSE streaming, production
identity/tenant authorization, and NestJS migration remain planned scope.
