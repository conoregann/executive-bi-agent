# Web interface direction

This folder owns the React/Vite presentation of the bounded synthetic MRR workflow. Follow the root `AGENTS.md` and the executive web and answer contracts in `docs/architecture/`.

- Keep the interface unbranded. Use plain product language, short labels, and no promotional or generic AI copy.
- Prioritize the result: reporting period and scope, answer, drivers, breakdown, then supporting context. Put provenance, limitations, and the retained plan within easy reach without giving every detail equal visual weight.
- Apply a consistent grid, aligned edges, deliberate spacing, restrained color, clear type hierarchy, and strong text contrast. Use one accent to emphasize actions or data, with negative movement distinguished accessibly by text and color.
- Design for desktop and narrow screens. Inputs, tables, citations, disclosures, statuses, and focus states must remain usable with a keyboard and screen reader.
- Keep Tailwind CSS in the Vite pipeline. Prefer existing React, semantic HTML, and small local styles; add libraries only when they solve a demonstrated need.
- Preserve exact scope, synthetic labeling, deterministic values, inspectable citations, token handling, and honest blocked or unavailable states. The UI formats trusted values; it never computes metrics or invents explanations.
