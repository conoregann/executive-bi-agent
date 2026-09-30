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

## Case: independent document audience

| Field             | Expected contract                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fixture           | A synthetic admin-only Acme document, a synthetic Acme/Other document with both account IDs in its customer policy, and an Acme-only document all match `pricing`. |
| Request           | A restricted Acme viewer searches within Acme scope.                                                                                                               |
| Required behavior | Return only the Acme-only excerpt and retain its access policy with the citation. A viewer granted both accounts may read the mixed document.                      |
| Prohibited answer | Return admin-only or mixed-account text through a hit, retained citation, or model evidence.                                                                       |

## Case: missing classification

| Field             | Expected contract                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fixture           | An untagged synthetic document without an access policy or a customer-tagged document whose policy omits one tag. |
| Required behavior | Reject the document at indexing.                                                                                  |
| Prohibited answer | Treat absent policy or customer tagging as implicit permission.                                                   |
