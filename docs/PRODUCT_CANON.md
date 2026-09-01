# Product canon

**Last updated:** 2026-08-28
**Tier:** Reference, a pointer file. It holds no content of its own on purpose.

## Start here

Canon lives in `novara-brain`, which is the non-code repo. Nothing in this file is content; it is a pointer, and a stale pointer is worse than none.

| Read | Path in `novara-brain` | What it is |
|---|---|---|
| **1** | `CONTEXT.md` | **Canonical compile-truth.** What is true now: positioning, model, payer, traction, canonical numbers, language rules |
| **2** | `01-memory/decisions.md` | Active strategic decisions. Read every session |
| **3** | `03-product/strategy/Novara_Pivot_Consolidation_SSOT_2026-08-28.md` | The pivot, the research behind it, and the conflicts still open |
| as needed | `CANON_INBOX.md` | Decisions captured but not yet folded into `CONTEXT.md` |

**If you make or learn a decision that changes what is true about Novara**, update `CONTEXT.md` or append to `CANON_INBOX.md` before the session ends. See the canon sync rule in `novara-brain/CLAUDE.md`. `novara-brain/scripts/canon_check.py` enforces it and a weekday scheduled task reports drift.


The product model, the feature set and the **normative design rules** live in `novara-brain`, the
non-code repo. This file exists so a session opening `novara-host` can find them.

| Document | Path in `novara-brain` |
|---|---|
| Strategy overhaul, 2026-08-27 | `03-product/strategy/Novara_Strategy_Overhaul_2026-08-27.md` |
| Context update, unified model | `03-product/strategy/Context_Update_2026-08-27_unified-model-and-standing-intentions.md` |
| Consumer PRD v2, F1 to F43 | `03-product/prds/Novara_Consumer_PRD_v2.md` |
| Plan type library v1 | `03-product/prds/Novara_Plan_Type_Library_v1.md` |
| **Design rules v1, normative** | `03-product/design/Novara_Design_Rules_v1.md` |
| Reconciliation against code, 2026-08-28 | `00-now/audits/2026-08-28-prd-v2-vs-code-reconciliation.md` |

**`Novara_Design_Rules_v1.md` applies to Novara Hosts, to guest token pages, and to share cards,
not only to the Flutter app.** Its section 0 names this repo explicitly. Read it before producing
any UI here.

## What the new canon says about this repo

**Hosting is a role occupied per plan, not a persona.** A plan with three guests and one with three
hundred are the same object. The consumer and host split is device ergonomics, not capability:
mobile captures and shows up, desktop prepares and analyses. Nobody manages 1,233 contacts on a
phone, and nobody wants a run of show on one.

**Workspace only, and deliberately so:** managing over a thousand contacts, partner pipelines with
deal terms, sponsor-facing ROI, multi-event series analytics, bulk import and export, run of show
with assigned roles and timings, task lists with due dates. Novara Hosts should get denser, not
softer. The failure mode to defend against is the consumer app drifting into a lighter host app.

**Hosts are how we acquire, members are who we monetise.** The strategy doc's recommendation 12.1
reframes host tooling as a distribution cost rather than a revenue line. Host revenue still exists
through the commercial gate, meaning sponsors, ticketing and paid partners, as a smaller and later
motion. This is a recommendation with a position, not yet a settled price.

## F41, the host read cutover

PRD v2 F41: after the shared `people` and `interactions` collections land and are verified in
`novara`, host reads switch from `hp_people` to `people` and the `hp_` equivalent retires.

**Status as of 2026-08-28: not started, and correctly blocked.** No `people` or `interactions`
collection exists in any repo, in any branch, or in the deployed rules. The PRD makes this a
watched task, explicitly not part of an unattended pass, and requires it to be complete before
anyone else works in this repo.

**The seam is small, which is good news.** `hp_people` is read at
`src/data/firebase/firebaseApi.ts:506` and `:511` and updated at `:516`. There is no create path in
app code; documents are created out of band by `seed/people-store.ts`. Three reads and one write,
all in one file.

## Two things owed to `novara` from here

1. **Four collections are written into the consumer ruleset and not yet deployed.**
   `hp_availabilitySettings`, `hp_bookings`, `hp_friendLinks` and `hp_huddles`. Updated
   2026-09-01: the earlier wording here said they had no block at all, which was true on 2026-08-26
   and stopped being true on 2026-08-28. Per `docs/pending-rules.md`, they now exist in
   `novara/firebase/firestore.rules` but stay under **Pending** rather than Applied, because
   Applied in that file means deployed *and read back from the Firebase Rules API*. Until that
   read-back happens these four collections are unprotected in production and the availability
   features cannot run in `firebase` data mode. This repo cannot deploy rules by design, per
   ADR-0001 in `novara`.
2. ~~`MATCHING.md` here is a regenerated v1.6.1 sitting as an uncommitted working tree change.~~
   **Resolved 2026-08-28 in `f492a67`.** The working tree and `HEAD` both carry v1.6.2 at md5
   `142f77f6`. Verified 2026-09-01 by comparing `md5sum MATCHING.md` against
   `git show HEAD:MATCHING.md`. There is no floating diff.


## Checkout state, 2026-08-28 (resolved)

This checkout **was** 7 commits behind `origin/main`, and the canon branch cut from it showed
roughly 6,255 deletions across `src/lib/availability/`, `src/guest/BookingPage.tsx`,
`src/guest/HuddlePage.tsx` and `src/host/pages/AvailabilityPage.tsx`. A squash merge or force push
from that base would have reverted the personal availability and multi-party scheduling work in
`f876b8a` and `0d74189`.

**Rebased onto `origin/main` on 2026-08-28.** `git diff --stat origin/main..HEAD` now shows only
`CLAUDE.md`, `ENGINEERING.md` and `docs/PRODUCT_CANON.md`. No `src/` path appears. Both commits are
ancestors of HEAD. A safety tag `backup/pre-rebase-2026-08-28` points at the pre-rebase HEAD and can
be deleted once you are satisfied.

**One caveat.** The machine that ran the rebase had no GitHub credentials, so `git fetch origin`
could not run and the rebase used the locally tracked `origin/main` (`d819b80`). Re-fetch before
pushing in case origin has moved past that.

`1d62718`, the ENGINEERING.md mirror sync, was preserved rather than dropped: `origin/main` carries
its own mirror-sync commits but is missing this one's actual content. It now sits on this branch as
`cefcea8`. `ENGINEERING.md` section 12 says mirrors are synced on `main`, never from a feature
branch, so this is a protocol exception inherited from the old base rather than one introduced here.
If you would rather it sat on `main`, `git branch -f main cefcea8` and drop it from the branch.

~~`MATCHING.md` is still a floating uncommitted modification in this working tree.~~ Resolved in
`f492a67`; see the note above. This paragraph is kept rather than deleted because the checkout-state
section is a dated record.

The four unruled `hp_` collections stayed invisible for exactly the reason this section used to
describe: an audit run from a stale checkout sees an old picture of the `hp_` surface.
