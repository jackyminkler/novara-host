# Architecture Decision Records

A short, numbered, **immutable** record of one decision that was expensive to reverse.

The format is Michael Nygard's, unchanged since 2011 because it works: **Context,
Decision, Consequences.** What was true when you decided, what you chose, and what you
now have to live with.

The threshold, the immutability rule, and the protocol for who writes them are in
[`ENGINEERING.md` §3](../../ENGINEERING.md). This file covers only the mechanics.

---

## Quick reference

**Write one when** undoing the decision would require a migration, a redeploy of something
users depend on, a re-run, or an apology.

**Do not write one for** naming, layout, formatting, or anything with one obvious answer
and no rejected alternative.

**Never edit an Accepted ADR.** Write a new one and mark the old `Superseded by ADR-NNNN`.
The old text stays exactly as written, wrong and all — that is the point. A record that
gets edited whenever reality shifts eventually says only what is true today, which is what
`docs/ARCHITECTURE.md` is already for.

**Never generate one from a diff.** If the reasoning was not captured live, say where it
actually came from in the Context section. An ADR that admits it was transcribed from a
handoff doc is useful. One that invents a confident narrative is drift, produced faster.

---

## Status values

| Status | Meaning |
| --- | --- |
| `Proposed` | Written down, not yet decided. Useful as a decision *instrument* — write the options, sit with it, then flip the status. |
| `Accepted` | This is what we do. |
| `Superseded by ADR-NNNN` | A later ADR replaced this. The text below stays unchanged. |
| `Deprecated` | No longer applies; nothing replaced it. |

## Numbering

Sequential, zero-padded, per-repo, never reused. Gaps are fine; collisions are not. If two
land at once, whoever merges second bumps.

## The section that makes these load-bearing

**"What now has to stay true"** must name the invariant *and* the contract test that
guards it. If no test exists, say so explicitly and file the gap in `DEFERRED.md`.

That link is what separates a decision that was recorded from one that is enforced. The
`girls.csv` baseline in `novara-matching` is not a nice fact in a document — it is an
assertion that fails the build when a refactor quietly changes who gets matched with whom.

---

## Files here

- `0000-template.md` — copy this


No ADRs yet. Two decisions here already clear the bar and should be written the next time
either is touched: **open Google sign-in with per-document `ownerUid` isolation** (which
superseded the `hp_config/allowlist` gate on 2026-08-25) and **the two-HTTP-function guest
token model** (`hpGuestView` / `hpGuestSubmit`, no guest auth, no third endpoint).
