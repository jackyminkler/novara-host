# Feature documentation

One file per feature. The model, the rule, and why the surface map matters are in
[`ENGINEERING.md` §11](../../ENGINEERING.md). Start from [`0000-template.md`](0000-template.md).

The host platform's users are **hosts, co-hosts, sponsors, vendors and crew** — not
runners. Write the "What it does" section for them.

## Written

- [`templates.md`](templates.md) — the host's own plans: the library, the editor, save as
  template, and the matching configuration a template declares.
- [`recap-and-roi.md`](recap-and-roi.md) — what an event cost and what it returned:
  deliverables both directions, the spend log, show rate by source, per party outcomes, and
  the site lessons loop with its permit and date warnings.

## Owed

The features that most need one, because more than one surface reads the same data to produce
them:

- **Guest links** — the two-HTTP-function token model (`hpGuestView` / `hpGuestSubmit`),
  scope handling, and the no-account guarantee. Any change here touches rules, both
  functions, and every guest-facing route.
- **Events and run-of-show** — the subcollections (`parties`, `tasks`, `runOfShow`) that are
  deliberately **not** `hp_`-prefixed, which is why a collection-group rule is banned.
- **Guest CRM** — `hp_contacts`, `hp_people`, and where they surface.
- **Host onboarding** — open Google sign-in and per-document `ownerUid` isolation, which
  superseded the allowlist gate on 2026-08-25.

## Cross-product

Each doc's Cross-product section is where the consumer↔host bridge gets recorded before it
is built. Note the stake when you see it. The bridge is a designed integration, never an
ad-hoc read of another product's collections.
