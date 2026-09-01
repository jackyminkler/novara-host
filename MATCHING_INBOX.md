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

**Pending: none. Last swept 2026-09-01 into `MATCHING.md` 1.7.0.**

The 2026-08-27 M-match-0 block was swept when the M1 build merged (PR #6, 2026-09-01).
It landed as two section 08 status rows, splitting host integration into rank (shipped,
running in-app on the vendored matchcore) and sparks/pods (unchanged, still needing the
Python service), plus two settled decisions in section 09: the vendored third copy of the
rule set, and the deliberate `hp_` prefix deviation on the three analytics events.

The block also flagged the section 08 pace-divergence row as stale. It was already
corrected in 1.6.2, which records the concierge tools as ported to the half-life curve
with a separate gate; `drift_check.py` confirms the constants agree and reports 100
identical ranked pairs. No further action.
