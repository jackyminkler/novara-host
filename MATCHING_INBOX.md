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

## 2026-08-24 — host-app 3-mode matching: architecture decided (no engine fork)

- What changed: Decided how sparks/pods/rank land in the host app (MATCHING.md §11 roadmap item "pods and sparks as templates"). Approach: rank runs in-app via the existing parity-verified `novara-matching/console/matchcore.js`; sparks and pods stay Python-canonical behind a Cloud Run service the host app calls (proxied by a Node Function). No TypeScript re-implementation of sparks/pods, so the §12 drift rule is not widened. Matching becomes an event-template capability (template declares mode + profile + requiredQuestions); input is the event's imported hp_people guests; results stored owner-scoped per event.
- Why: rank is pure-stdlib and already ported; sparks (~500 loc) and pods (~900 loc) are pandas-based and the most correctness-critical code, so forking them into the browser/TS would create a permanent two-language drift burden. Verified 2026-08-24 that sparks/pods require the Circe mentor columns (intent/share/learn) and error on app-user / plain-run exports, while rank runs on them (109/148 app users matched) — so the template must surface the required registration questions pre-event.
- Files touched: `docs/Host_App_Matching_Feature_Spec_v1.md` (new). No code yet; no MATCHING.md hand-edit (generated).
