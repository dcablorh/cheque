# Animation plans

Plans produced by the improve-animations workflow. Each plan is self-contained and can be
executed by any agent (or human) with zero context. Execute in the order below.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Hero globe with orbiting currency coins](001-hero-globe-orbit.md) | MEDIUM | DONE (feel-check pending) |

## Execution order

1. **001** — no dependencies. Touches `frontend/src/app/page.tsx`,
   `frontend/tailwind.config.ts`, `frontend/src/app/globals.css`, and adds
   `frontend/src/components/GlobeOrbit.tsx`.

## Notes

- Plans are stamped with the commit they were written against (001 → `964f599`). If the
  code has drifted, the executor must stop and report rather than improvise.
- `frontend/src/components/ChequeCalculator.tsx` becomes unused after 001 but is
  deliberately kept on disk — it is a candidate for reuse on a future pricing page.
