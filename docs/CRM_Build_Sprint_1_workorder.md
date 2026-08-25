# CRM build — Sprint 1 work order (for Claude Code)

**Date:** 2026-08-24. **Repo:** novara-host. **Goal of this sprint:** get Jacky working with her real CRM in the host app, on isolated per-host data, and have Vicki test it.

Read first: `docs/Guest_CRM_Plan_v1.md` (the CRM feature), `docs/Partner_Identity_And_Linking_Model_v1.md` (record-vs-identity model), and the two security specs (`SECURITY-users-pii-remediation-2026-08-24.md`, `SECURITY-invariants-and-ci-gate-2026-08-24.md`) in the consumer repo — the multi-tenant rules here follow the same discipline. Honor CLAUDE.md throughout (api.ts seam, rules via consumer-repo pending-rules handover, no consumer-app collections, copy rules, `tsc --noEmit` + build green).

The sprint is five steps, each shippable alone. Do them in order; don't start a step until the previous one is verified.

## Step 0 — seed Jacky's real content (no code, do first)

Her real templates and partner directory are ready as data in `seed/content.json` (already written; gitignored). Set `ownerUid` to her host Google UID (from `hp_config/allowlist`), then `node seed/seed.mjs --dry-run` and, if correct, `node seed/seed.mjs`. This puts three recurring templates (Sunrise run + DJ set, Circe collab run, Girls run + brunch) and seven partner orgs into `hp_templates` / `hp_orgs`. Clear the `TODO` markers in that file as details are confirmed. This alone gives her recurring templates in place today.

Her captured contacts from the Aug 22 girls run are already in `seed/contacts.json` (loader `seed/seed-contacts.mjs`); those are `hp_contacts`, a separate concept from the guest CRM below.

## Step 1 — multi-tenant foundation (ownerUid everywhere)

Today every `list*` in `src/data/api.ts` returns all rows and the rules only check `hpIsHost()` (on the allowlist), not ownership. Before any second person logs in, fix this or Vicki sees Jacky's data.

- Ensure every top-level `hp_*` doc carries an owner field. `hp_orgs` and `hp_events` already have `createdBy` / `hostUid`; standardize on one owner field per collection and add it where missing (`hp_templates.ownerUid` exists; `hp_contacts`, `hp_availability`, `hp_moments` need one).
- In `firebaseApi`, every `list*` query filters by `where(ownerField, '==', currentUid)`. In `mockApi`, filter the store the same way so mock mode also behaves multi-tenant.
- Tighten each `hp_*` rule from `hpIsHost()` to `hpIsHost() && resource.data.<owner> == request.auth.uid` (and the `request.resource` form on write). Write the exact blocks to `docs/pending-rules.md` and stop for Jacky to apply through the consumer repo (standing handover). Surface any new composite index (e.g. `hp_people (ownerUid asc, tier asc, lastSeenAt desc)`) at the same time.
- Backfill: a one-time script stamps Jacky's UID as owner on every existing `hp_*` doc that predates the owner field. Idempotent, dry-run default.
- Tests: add emulator-backed rules cases (per the consumer-repo guardrail style) — a second host cannot read Jacky's `hp_*` docs; the owner can. Keep `firestore-rules-coverage` green.

Keep the allowlist gate for now: it's the cheapest way to run a closed test. Do NOT open public signup this sprint.

## Step 2 — CRM-0: import the guest CSVs into hp_people

Build `seed/import-luma-guests.ts` per Guest CRM Plan §CRM-0: reads a Luma export CSV + an event key, upserts into `hp_people` keyed by normalized (trim+lowercase) email, appends/updates the per-event `registrations` entry, recomputes `tier` and `eventCount`, stamps `ownerUid`. Idempotent. Include `appUserUid: null` (the identity link from the partner-identity model; the matcher is a later phase).

Run it on the four exports in the brain repo (`Novara-Brain/03-product/matching/event-data/*/guests-export-luma.csv`): 2026-03-21 crissy, 2026-06-13 sunrise-run-2, 2026-06-27 pineapples, 2026-08-22 girls-run. Expected after dedupe: ~1,233 people (837 signed_up, 352 invited_only, 44 declined_only, 134 with 2+ events). Rules block for `hp_people` lands via pending-rules.md before first write.

## Step 3 — CRM-1: the People page

Host-only route per Guest CRM Plan §CRM-1, through the `api.ts` seam (mock + firebase). List with search (name/email), filters (tier, event, tag, repeat-attendees), sort by lastSeen / eventCount. Person detail: identity, per-event history, survey answers, and the writable fields (notes, follow-up, tags). Ship the five saved segments from `Novara-Brain/04-marketing/crm/segments/` as the default filters (repeat attendees, signed-up-not-in-app, invited-never-came, Lume-waitlist-yes, superconnectors) — these are the queries Jacky and Vicki will actually run. Amplitude events per the plan. This is the screen that makes the CRM real to a tester.

## Step 4 — friends-and-family test with Vicki

- Add Vicki's (and chosen family) Google UIDs to `hp_config/allowlist`. With Step 1 done, each sees only their own empty workspace.
- Give Vicki something real on day one: she can seed her own `content.json` (her Lume events/partners), and the 290 Lume-waitlist opt-ins from the Jun 13 run are legitimately hers to import (they said yes to Lume). That is the concrete "why this is useful to me" moment for a co-host.
- Add a lightweight in-app feedback capture (a single `hp_feedback` doc write from a persistent "Feedback" affordance, owner-stamped) so testers can tell Jacky what to add without leaving the app. Smallest possible; not a whole system.
- Do NOT build the co-host event-sharing or the identity-link matcher this sprint. Those are the next sprint, specified in the partner-identity model. Keeping them out is what makes this sprint shippable.

## Definition of done for the sprint

Jacky's real templates + partners are live in her host app; the four guest exports are imported into `hp_people`; the People page browses and filters them; a second account (Vicki) logs in and sees only her own data, verified by a rules test; `tsc --noEmit`, `npm run build`, and the rules/contract tests are green; every new UI string passes the copy rules.
