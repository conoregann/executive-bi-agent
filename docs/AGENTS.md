# Documentation Guide

Documentation defines durable boundaries and product contracts. Keep it concise,
implementation-independent, and aligned with executable tests.

- Put system-wide intent in `Spec.md`; place executable runtime contracts in
  `architecture/`, metric definitions in `metrics/`, and user-question behavior
  in `discovery/`.
- Define inputs, outputs, validation, ownership, evidence, limitations, and
  non-goals when documenting a boundary.
- Describe actual behavior only. Do not claim unimplemented apps, tools, data
  sources, or guarantees.
- For a contract change, update its implementation, focused tests, and relevant
  evaluation in the same change. Flag conflicts between `Spec.md` and focused
  contracts rather than silently resolving them.
- Avoid duplicate code walkthroughs and speculative roadmap prose.
