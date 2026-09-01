# Contributing to novara-host

The cross-repo standard is [`ENGINEERING.md`](ENGINEERING.md). **Read that first.**

This file is the repo-specific layer. `CLAUDE.md` holds the product rules — the three
principles, the copy rules, and design system A.1 — and takes precedence on anything it
covers.

---

## The gate

```bash
npx tsc --noEmit
npm run build
```

Rules tests need the emulator running:

```bash
npm run emulators        # separate terminal
npm run test:rules
```

> Wired into CI 2026-08-31: `.github/workflows/ci.yml` runs typecheck, build, and the
> ownership suite against the emulator (`rules-suite` job) on every PR and push to `main`.

Definition of done for a feature is in `CLAUDE.md` — acceptance criteria, wireframe match,
copy rules, 390 px verification, Amplitude events, and the two commands above.

---

## The boundary you must not cross

This repo **cannot deploy Firestore rules, and that is deliberate.** `firebase.json` here
has no `firestore` section. See
[ADR-0001 in the consumer repo](https://github.com/jackyminkler/novara-flutterflow/tree/main/docs/adr)
for why: one ruleset file with two deployers is not a union, it is last-writer-wins, and
the failure mode is every consumer read returning permission-denied in production.

When a new or changed `hp_` collection needs rules, a composite index, or a Storage path
(full flow with the reasons: the Workflow section of `docs/pending-rules.md`):

1. Write the exact match block or index definition to `docs/pending-rules.md`.
2. Mirror it into `emulator/firestore.rules` and add behavioural cases to
   `tests/ownership.rules.test.ts`, negative-control first.
3. Open a PR — CI runs the ownership suite. Jacky reviews the PR; she does not run the
   deploy. The block deploys from `novara` `main`, and moves to Applied only on Firebase
   Rules API read-back (`novara/tools/rules_check.py` checks this on weekdays).

Surface index needs **when the query is written**, not when it breaks — a query needing a
composite index fails at runtime until the index is applied and built.

Never propose a collection-group rule (`match /{path=**}/name/`). Those span the consumer
app's subcollections too in the shared ruleset, and this repo's subcollections
(`parties`, `tasks`, `runOfShow`) are not `hp_`-prefixed.

Deploys always use explicit targets:

```bash
firebase deploy --only functions:hosts,hosting:novara-host
```

---

## Commits

Conventional Commits, per [`ENGINEERING.md` §5](ENGINEERING.md). Scopes here: `events`,
`tasks`, `guests`, `crm`, `rules`, `functions`.

Note the copy rules in `CLAUDE.md` — no em dashes, sentence case — apply to **UI strings,
errors, and empty states**. Commit messages and docs are normal prose.

---

## Decisions

Expensive-to-reverse calls get an ADR in `docs/adr/`, written in the session that decides.
Anything touching the guest token model, the `ownerUid` isolation scheme, or the
`src/data/api.ts` seam clears the bar.
