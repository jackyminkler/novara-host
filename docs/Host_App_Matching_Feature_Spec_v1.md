# Host-app matching feature spec v1 (sparks / pods / rank as event templates)

**Date:** 2026-08-24. **Repo:** novara-host. **Status:** Design decision, pre-build. Decided by Jacky in Cowork 2026-08-24 (chose host-app integration over a browser port of the engine).

Read alongside `MATCHING.md` (single source of truth; §08 status board lists host-app matching as "not started", §11 roadmap names "pods and sparks as templates" as the target). This spec is the plan for that roadmap item. It does NOT edit `MATCHING.md` (generated file); the decision is logged in `MATCHING_INBOX.md` for the next sweep.

## The decision that shapes everything: one engine, no fork

The three formats are not equal in portability, and that dictates the architecture:

- **rank** is 281 lines of pure Python and is ALREADY ported to JavaScript, parity-verified, as `novara-matching/console/matchcore.js` (the browser Match Console). The host app can reuse that port directly, client-side, through the `api.ts` seam.
- **sparks** (~500 lines) and **pods** (~900 lines) use pandas and are the most correctness-critical code Novara has. Per the `MATCHING.md` drift rule, any port must stay in lockstep with the Python or be logged as a divergence. Re-implementing them in TypeScript would fork the hardest logic in the company into a second language, forever.

So: **rank runs in-app via the existing matchcore.js port; sparks and pods stay Python-canonical behind a small service the host app calls.** Python stays the single source of truth for the complex formats; nothing is re-implemented.

### The service (sparks/pods)

Deploy `novara-matching` as a callable HTTP service (Cloud Run container: Python 3.10 + the repo). One authenticated endpoint: `POST /match { format, profileName, csv }` → returns the same JSON the CLI produces (`sparks.json` / `pods.json` shape). The host app calls it from a Firebase Function (Node 20 can't run Python in-process, so a Function proxies to Cloud Run and adds auth/allowlist checks). The container pins a `novara-matching` git SHA so results are reproducible and the engine version is explicit. No engine code lives in novara-host.

## How it plugs into the host app

Matching is an event-level capability, driven by the event's template:

1. **Template declares the mode.** Extend `Template` (and `hp_templates`) with `matching: { mode: "sparks" | "pods" | "rank", profileName: string, requiredQuestions: string[] } | null`. The seeded "Girls run + brunch" template → `sparks` / `circe_sparks_v1`; a concierge template → `rank`. A plain DJ run → `null` (no matching) until its form collects the questions.
2. **Guest data is the input.** Matching consumes the guests already imported into `hp_people` for that event (Guest CRM plan, CRM-0/CRM-3). The host app serializes the event's guests (plus their registration `answers`) to the CSV shape the engine expects and runs the selected mode. No separate upload once the CRM import exists.
3. **Run + view.** An event screen gets a "Run matching" action (host-only). Rank renders inline (matchcore.js). Sparks/pods POST to the service and render the returned pairs/pods. Results are stored per-event (`hp_events/{id}/matching/{runId}`, owner-scoped) so a run is reproducible and the field-facing output (spark cards, pod sheets) can be regenerated.
4. **Amplitude:** `matching_run_started` (mode), `matching_run_completed` (people, edges/pods/matched), `matching_results_viewed`.

## The dependency you must surface: registration questions

sparks and pods DO NOT run on arbitrary guest data. They require the Circe mentor questions — `intent` (who you want to meet / mentor vs seek), `share` (what you can talk about), `learn` (what you want to learn), plus pace. Verified 2026-08-24: the app-users export and the plain sunrise-run exports lack these, so sparks/pods error with "required columns not found"; only rank runs on them.

Therefore the template's `requiredQuestions` must be shown to the host BEFORE the event, as the exact questions to add to the Luma (or in-app) registration form. When an event's mode is sparks/pods but its imported guests lack those columns, the UI must say so plainly ("this event's signup form didn't ask the mentor questions, so sparks can't run; here are the questions to add next time") rather than returning blanks. This is the same failure that made the browser console look broken.

## Phasing

- **M-match-0: rank in-app.** Reuse `matchcore.js` behind `api.ts`; "Run matching" on an event's imported guests; inline results with reasons. Ships value immediately, no service, no new infra. (rank already runs on app-style data: 109/148 app users matched in testing.)
- **M-match-1: the service.** Stand up the Cloud Run engine service + the proxying Function; wire sparks/pods; store runs per event. Pinned engine SHA.
- **M-match-2: registration-question surfacing.** Template `requiredQuestions` shown pre-event; clear "can't run, here's why + the questions to add" empty state; optional export of the field-facing sparks cards / pods workbook (the `build_xlsx` in `Novara-Brain/05-launch/events/matching/`).

## Boundaries honored

- One engine: Python canonical for sparks/pods, the parity-verified matchcore.js for rank. No new re-implementation of sparks/pods.
- Drift rule (`MATCHING.md` §12): unchanged, because the complex formats are not re-coded. Any change to matchcore.js still must mirror rank.py.
- `hp_` namespace, owner-scoped rules via the consumer-repo pending-rules handover, api.ts seam, copy rules — all as in the CRM sprint work order.
- Matching results are host-only and owner-scoped; guests never read them.
