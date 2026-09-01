# Matching decisions inbox

This file is the handoff channel from code sessions back to the canonical
matching document. `MATCHING.md` is GENERATED (from `content.py` in
`Novara-Brain/03-product/matching/source/`) — never edit it by hand.

**If you are Claude Code (or any AI) and a matching decision was made in this
checkout** — a weight changed, a rule settled, a tolerance tuned, a trap
discovered — append a block here and commit it alongside the code change:

```
## YYYY-MM-DD — short title
- What changed:
- Why:
- Files touched:
```

**If you are Jacky**: when one or more blocks have accumulated, open the
Novara Cowork project and say "sweep the matching inbox". Cowork reads the
inboxes in every checkout, logs the decisions into MATCHING.md's decision log,
re-renders, republishes the field-guide artifact, syncs all mirrors, and
clears the swept blocks from this file.

Mirrors of this inbox live next to every MATCHING.md copy: `novara/`,
`novara-host/`, `novara-matching/`, and `Novara-Brain/03-product/matching/`.
Append to whichever checkout you are working in.

---

**Pending: one block, below. Last swept 2026-09-01 into `MATCHING.md` 1.7.0.**

## 2026-09-01 — the 0 = Monday hazard is a language accident, not a design choice

- **What changed:** No behaviour. A correction to how an already-recorded trap is
  characterised. Section 03 of `MATCHING.md` names the weekday-index divergence as "the hazard
  worth naming twice" and is accurate about the risk. What was not written down anywhere is
  *why* the two conventions differ, and the host-side doc had it filed as a deliberate
  difference, which it is not. Neither app chose a convention. This repo indexes off
  JavaScript's `Date.getDay()`, which is 0 = Sunday. The consumer indexes off Dart's
  `DateTime.weekday`, which is 1 = Monday, minus one, landing on 0 = Monday
  (`novaraDayIndex`, `novara/lib/services/availability/derive_windows.dart`). Two languages
  disagree about when a week starts, and each app followed its own primitive.
- **Why it matters:** "Deliberate" invites the next reader to look for a rationale worth
  respecting. There is none to find, and the time spent looking is time not spent converting at
  the boundary. What *is* deliberate is the decision not to unify, because the consumer's form
  is entrenched in the `availabilityDays` map keys, in the `d` of every `effectiveWindows`
  entry, and in the scorer and its parity twins, so unifying means a live-document migration
  plus a four-way engine change to fix something not currently broken.
- **The part that is forward-looking:** the divergence is inert today only because the two apps
  never exchange weekday arrays. `docs/adr/0001-one-solver-two-doors.md` in `novara-host`
  proposes a solver reached over the wire by a Dart caller, which creates exactly that exchange
  as untyped JSON, at the one boundary where the type system is gone by construction.
  `weekdays` on `SuggestOptions` is a bare `number[]`. Filed as an assertion owed by the
  deferred wire-schema test.
- **Files touched:** `novara-host/docs/Availability_Feature_Plan_v1.md` section 4b item 1,
  `novara-host/DEFERRED.md`. No code, no scorer, no weights.

The 2026-08-27 M-match-0 block was swept when the M1 build merged (PR #6, 2026-09-01).
It landed as two section 08 status rows, splitting host integration into rank (shipped,
running in-app on the vendored matchcore) and sparks/pods (unchanged, still needing the
Python service), plus two settled decisions in section 09: the vendored third copy of the
rule set, and the deliberate `hp_` prefix deviation on the three analytics events.

The block also flagged the section 08 pace-divergence row as stale. It was already
corrected in 1.6.2, which records the concierge tools as ported to the half-life curve
with a separate gate; `drift_check.py` confirms the constants agree and reports 100
identical ranked pairs. No further action.
