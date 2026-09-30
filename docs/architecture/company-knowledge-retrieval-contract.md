# Company-knowledge retrieval contract

## Purpose

The company-knowledge capability retrieves bounded excerpts from pre-approved
internal documents so an investigation can cite operational context alongside
structured analytics. It does not interpret documents, establish causality, or
expose documents outside the active permission scope.

## Boundary

```text
typed document input → deterministic chunking and validation → scoped lexical search
                     → ranked excerpts + document-chunk evidence
```

The initial implementation is an in-process, deterministic corpus adapter for
synthetic knowledge. A future storage or semantic-retrieval adapter must retain
the same typed request, scope enforcement, bounded results, and evidence
requirements before it can replace this boundary.

## Document input

Each document has a stable `documentId`, title, source, observed timestamp,
freshness timestamp, content, optional canonical customer tags, and a required
access policy. The adapter
rejects duplicate IDs, invalid timestamps, empty identity fields, malformed
customer IDs, and content longer than 10,000 characters. Documents are split
deterministically into excerpts no longer than 1,200 characters.

The access policy is `company`, `admin`, or `customers` with a non-empty list of
canonical customer IDs. `company` permits any authenticated company user;
`admin` permits admins; `customers` permits a restricted user only when their
current grants include **every** policy customer ID. Admins may read all three.
The policy applies to the whole document and every generated excerpt. A document
covering multiple accounts must list every account in its customer policy, or
be `admin`. It must never be split into excerpts with weaker access than the
source. Customer tags only select relevant documents: a tag does not grant
access. Tagged documents cannot use `company` access, and every tag must be
covered by a `customers` policy. Untagged documents also require an explicit
policy, but do not participate in customer-scoped searches. Ingestion must classify account mentions before indexing; this
adapter does not infer confidentiality from prose.

## Search contract

`search_company_knowledge` accepts only the following search fields; a trusted
caller separately supplies the authenticated viewer role and current customer
grants. Missing or invalid viewer access and out-of-grant filters fail closed.

| Field         | Requirement                                              |
| ------------- | -------------------------------------------------------- |
| `query`       | Non-empty text containing at least one searchable token. |
| `customerIds` | Optional non-empty list of canonical customer IDs.       |
| `limit`       | Optional integer from 1 through 20; defaults to 5.       |

Unknown fields and invalid values produce `invalid_request` before retrieval.
Matching is deterministic lexical token matching. Hits are ranked by the
number of distinct query tokens present, then stable corpus order. This ranking
is retrieval relevance only; it is not evidence strength or a causal score.

No matching excerpt returns `ok` with `no_matching_knowledge`; it must not
trigger a generated explanation or an unbounded second search.

## Evidence output

Every hit includes `document_chunk` evidence with a stable source reference,
source and retrieval timestamps, resolved customer scope, the document access
policy, bounded excerpt,
freshness, and `valid` integrity. It can be combined with metric evidence in an
investigation, but the synthesis layer must preserve the evidence contract:
document context supports context or a qualified hypothesis, never an uncited
metric claim or a causal conclusion.
The API checks both the retained and current document policies against current
user grants before returning an investigation, answer, or citation and before
a follow-up uses parent evidence. Removed or reclassified documents fail closed.
A failed check returns not found and supplies no model input.

## Non-goals

- External document connectors, vector stores, and embedding models.
- Full-document display, free-form document access, or mutation.
- Cross-customer disclosure through inferred identity matching.
- Automatic conclusions, recommendations, or causal attribution.
