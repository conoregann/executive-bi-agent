# Web interface direction

This folder owns the React/Vite presentation of the bounded synthetic MRR workflow. Follow the root `AGENTS.md` and the executive web and answer contracts in `docs/architecture/`.

- Keep the interface unbranded. Use plain product language, short labels, and no promotional or generic AI copy.
- Prioritize the result: reporting period and scope, answer, drivers, breakdown, then supporting context. Put provenance, limitations, and the retained plan within easy reach without giving every detail equal visual weight.
- Apply a consistent grid, aligned edges, deliberate spacing, restrained color, clear type hierarchy, and strong text contrast. Prefer connected, borderless result sections separated by thin grey rules; reserve solid black rules for major boundaries. Use neutral greys, and rely on spacing and scale before bold weight. Keep small text comfortably readable and use consistent, softly rounded controls. Negative movement must remain distinguishable by text as well as color.
- Keep the request panel on the left. A quiet control in the header must fully collapse and restore the panel without losing entered form state; collapsed fields must leave the keyboard and accessibility tree.
- Design for desktop and narrow screens. Inputs, tables, citations, disclosures, statuses, and focus states must remain usable with a keyboard and screen reader.
- Keep Tailwind CSS in the Vite pipeline. Prefer existing React, semantic HTML, and small local styles; add libraries only when they solve a demonstrated need.
- Preserve exact scope, deterministic values, inspectable citations, token handling, and honest blocked or unavailable states. Synthetic fixtures and source records retain their provenance. The UI formats trusted values; it never computes metrics or invents explanations.
