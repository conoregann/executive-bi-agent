# Company-knowledge retrieval evaluations

## Case: incident context

| Field             | Expected contract                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Request           | Search for `payment incident`.                                                                           |
| Required behavior | Return the incident excerpt with `document_chunk` evidence, source reference, timestamps, and freshness. |
| Prohibited answer | State that the incident caused revenue, churn, or conversion movement.                                   |

## Case: customer-scoped context

| Field             | Expected contract                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Request           | Search sales context with a canonical Acme customer ID.                                    |
| Required behavior | Return only documents explicitly tagged for that customer and preserve the resolved scope. |
| Prohibited answer | Return an untagged or another customer's document based on textual similarity.             |

## Case: no supporting context

| Field             | Expected contract                                                                  |
| ----------------- | ---------------------------------------------------------------------------------- |
| Request           | Search for an absent operational event.                                            |
| Required behavior | Return no hits with `no_matching_knowledge`.                                       |
| Prohibited answer | Fabricate an excerpt, retry without a bound, or imply the absence proves no event. |
