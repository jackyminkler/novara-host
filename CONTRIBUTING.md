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

> **CI runs the gate on every PR and push to `main`** (`.github/workflows/ci.yml`, added
> 2026-08-26): typecheck, build, docs consistency, and the rules-ownership boundary.
> Rules tests are the exception. They need the emulator, so they run on your machine or
> they do not run. See `ENGINEERING.md` §8.

Definition of done for a feature is in `CLAUDE.md` — acceptance criteria, wireframe match,
copy rules, 390 px verification, Amplitude events, and the two commands above.

---

## The boundary you must not cross

This repo **cannot deploy Firestore rules, and that is deliberate.** `firebase.json` here
has no `firestore` section. See
[ADR-0001 in the consumer repo](https://github.com/jackyminkler/novara-flutterflow/tree/main/docs/adr)
for why: one ruleset file with two deployers is not a union, it is last-writer-wins, and
the failure mode is every consumer read returning permission-denied in production.

When a new or changed `hp_` collection needs rules, a composite index, or a Storage path:

1. Write the exact match block or index definition to `docs/pending-rules.md`.
2. Tell Jacky.
3. **Stop.** She applies it through the consumer repo.

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

---

## Contributing as a friend

For trusted friends invited to learn the codebase and build test features. Everything
above applies to you too; this section is what you can reach and what you cannot.

**Access is GitHub only.** Collaborator on this repo, nothing else: no Firebase console,
no deploy rights, no `.env.local` values, no seed scripts (those run with admin
credentials on Jacky's machine). You will not miss any of it — the repo is built so that
code access and data access are separate things.

**Branches and PRs, never `main`.** Work on a branch named `yourname/what-it-is`, open a
PR, and Jacky reviews and merges. Never push or force-push to `main`. Merging is not
deploying: nothing ships until Jacky deploys from her machine, so a merged mistake is a
`git revert`, not an incident. You will also see `claude/*` branches here — agent
sessions work in this repo under the same rules. Leave them alone.

**Start in mock mode.**

```bash
npm install
npm run dev:mock
```

The entire app runs in memory with fictional data: no Firebase, no credentials, nothing
to configure. Build UI features here. Before your first PR, read `CLAUDE.md` — the three
principles, the hard rules, and the copy rules are the review bar, and the definition of
done is the checklist.

**Graduate to the emulators for data features.**

```bash
npm run emulators        # separate terminal
npm run dev:emu
```

The emulator project id starts with `demo-`, which Firebase treats as offline-only. It
cannot reach a real cloud project, so nothing you do here can touch real data.

**Rules work happens locally and ships through Jacky.** The emulator uses the local copy
at `emulator/firestore.rules`; `npm run test:rules` tests it. When a feature needs a
production rules change, propose the exact match block in `docs/pending-rules.md` in your
PR, per [the boundary above](#the-boundary-you-must-not-cross). You never deploy rules.
Neither does this repo. That is the point.
