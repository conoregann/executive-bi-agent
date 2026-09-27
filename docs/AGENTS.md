# Documentation Guide

Documentation defines durable boundaries and product contracts. Keep it concise,
implementation-independent, and aligned with executable tests.

- Put system-wide intent in [root `Spec.md`](../Spec.md); place executable runtime contracts in
  `architecture/`, metric definitions in `metrics/`, and user-question behavior
  in `discovery/`.
- Define inputs, outputs, validation, ownership, evidence, limitations, and
  non-goals when documenting a boundary.
- Label current behavior and planned intent explicitly. Do not present
  unimplemented apps, tools, data sources, or guarantees as current.
- For a contract change, update its implementation, focused tests, and relevant
  evaluation in the same change. Flag conflicts between [root `Spec.md`](../Spec.md) and focused
  contracts rather than silently resolving them.
- Avoid duplicate code walkthroughs and speculative roadmap prose.
