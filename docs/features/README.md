# Feature documentation

One file per feature. The model, the rule, and why the surface map matters are in
[`ENGINEERING.md` §11](../../ENGINEERING.md). Start from [`0000-template.md`](0000-template.md).

The host platform's users are **hosts, co-hosts, sponsors, vendors and crew** — not
runners. Write the "What it does" section for them.

## Written

- [`templates.md`](templates.md) — the host's own plans: the library, the editor, save as
  template, and the matching configuration a template declares.
- [`matching.md`](matching.md) — pairing up the people who signed up: the vendored rank engine,
  the columns it reads out of signup answers, the three ways a run comes up empty, and why sparks
  and pods stay behind the Python service.
- [`recap-and-roi.md`](recap-and-roi.md) — what an event cost and what it returned:
  deliverables both directions, the spend log, show rate by source, per party outcomes, and
  the site lessons loop with its permit and date warnings.
- [`guest-crm.md`](guest-crm.md) — the two lists and everything that moves between them:
  captures as the fast inbox, people as the durable list, the shared import pipeline, segments
  and export, the follow-up hub, promotion, and the `appUserUid` identity link.
- [`guest-links.md`](guest-links.md) — how everyone who is not the host takes part: the two
  HTTP functions, the four token scopes and the actions each one accepts, revocation, the
  share card, and the no-account guarantee.

## Owed

The features that most need one, because more than one surface reads the same data to produce
them:

- **Events and run-of-show** — the subcollections (`parties`, `tasks`, `runOfShow`) that are
  deliberately **not** `hp_`-prefixed, which is why a collection-group rule is banned.
- **Host onboarding** — open Google sign-in and per-document `ownerUid` isolation, which
  superseded the allowlist gate on 2026-08-25.

## Cross-product

Each doc's Cross-product section is where the consumer↔host bridge gets recorded before it
is built. Note the stake when you see it. The bridge is a designed integration, never an
ad-hoc read of another product's collections.
