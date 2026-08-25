# Notes on the Cowork to Claude Code spec handoff

**Date:** 2026-08-25. Written after building CRM sprint 1 from
`docs/CRM_Build_Sprint_1_workorder.md`, `docs/Guest_CRM_Plan_v1.md`, and
`docs/Partner_Identity_And_Linking_Model_v1.md`.

Purpose: a short, concrete record of where the specs held and where they slipped, so the
next handoff is better shaped. Not a complaint. The strategy work in these documents was
good enough that the build followed it almost exactly.

## The pattern

Every error was at a point where the document asserted something about **this repo's code**.
Nothing in the strategy, the data analysis, or the model design was wrong.

This was not an access problem. The author clearly had the brain repo (it built
`master-contacts.csv` from those exports) and had this repo's `CLAUDE.md` (it cites the
pending-rules handover, the `api.ts` seam, and the copy rules correctly). What it did not do
was **run** anything: no listing the export directory, no reading `instantiate.ts`, no
checking `package.json` for a test script. Reading a file and verifying a claim are different
acts, and specs die on the second one.

## What held

- The dedupe and tier figures were exactly right: 1,233 people, 837 / 352 / 44 by tier, 134
  repeat. An independent reimplementation reproduced all five on the first try.
- The `hp_people` schema, including the call to embed `registrations` as an array rather
  than a subcollection, with the reasoning stated.
- Stamping `ownerUid` from day one so multi-tenancy becomes a rules-only change.
- The record-versus-identity model. That document needed no code contact and is the
  strongest of the three.
- The phasing. CRM-0 through CRM-4 each genuinely ship alone.

## What slipped, and why each one mattered

| Claim | Reality | Cost if unchecked |
|---|---|---|
| "seven partner orgs" in `content.json` | Five. That file's own `_readme` explains the two exclusions. | Confusion only; the data was self-consistent. |
| All four exports are `event-data/*/guests-export-luma.csv` | The Aug 22 file is `girls-run-guests-export-2026-08-21.csv`. | A glob-based importer silently imports three of four. |
| `hp_contacts` "needs" an owner field | `capturedBy` already exists. | Minor. |
| "Keep `firestore-rules-coverage` green", "rules/contract tests are green" | **No test runner exists in this repo.** No vitest, no test script, no test files. The language was borrowed from the consumer repo. | A definition of done that cannot be met, discovered late. |
| Index `hp_people (ownerUid asc, tier asc, lastSeenAt desc)` | Not needed. `readAll` in `firebaseApi` does a plain `getDocs` and components sort in memory, so every scoped list is one equality filter. | A pointless handover through the consumer repo, and a wrong mental model of how the app queries. |
| `content.json` task offsets `-2` before `-3`, `-12` before `-14` | `instantiate.ts` sets `order: index`, so array position is the board sequence until a date is confirmed. | Every event made from those templates seeds out of order. |
| Contacts named literally `"TODO"` | A contact name renders in the partner directory UI. | Visible junk in the product. |

## What to change in the next spec

Not "write less design in Cowork". The design was the valuable part. Change the *form* of
any sentence that touches code:

1. **State intent and acceptance, never mechanism.** "The People list must not need a
   composite index unless one is proven necessary" survives contact with the codebase.
   "Add index `(ownerUid, tier, lastSeenAt)`" does not.
2. **Mark every claim about existing code as a question, not a fact.** A short "Verify
   before building" list at the top of the work order, one line per assumption, is the single
   highest-value addition. It converts a silent wrong assertion into an explicit checked one.
3. **Never import a sibling repo's vocabulary without checking it exists here.** The
   `firestore-rules-coverage` reference came from the consumer repo's security specs. Naming
   the source repo for any borrowed convention makes the check obvious.
4. **Data files are code-adjacent.** `content.json` is consumed by `instantiate.ts`. Anything
   generated as data should say which module reads it, so ordering and display assumptions
   can be checked.
5. **Give counts a provenance line.** The 1,233 figures were right and verifiable because
   their source files were named. Do that for every number.

## The handoff mechanism that would fix this

This repo already has the pattern: `MATCHING_INBOX.md`, where Claude Code appends dated
decisions in the same commit as the code change, and Cowork sweeps them into `MATCHING.md`.

The same loop works for specs. Claude Code appends to this file whenever a spec claim turns
out to be wrong against the code; Cowork reads it before writing the next work order. The
corrections then compound instead of being rediscovered every sprint.

## Addendum, 2026-08-25: pin the commit when you check another repo

A finding recorded here as fact was reversed, then reversed back. The subject was whether the
consumer repo's `firestore.rules` carried the `hp_` blocks. Two checks an hour apart disagreed,
and the natural reading was that one of them misread. Neither did: PR #199 merged between them
and genuinely changed the answer. `main` had carried zero `hp_` blocks for six days while
production served eight, so a rules deploy from the repo would have dropped all of them.

Three things generalise:

- **Record the commit, not the branch.** `git rev-parse HEAD` alongside any finding about another
  repo. A branch name is a moving target the moment a second session is working there.
- **Two disagreeing checks mean the thing changed, at least as often as one of them was wrong.**
  Reaching for "I misread" is the comfortable resolution and it buried a real near miss.
- **Beware the tidy methodological lesson.** The retraction came with a confident rule, prefer
  `git log -S` over `grep`, that was itself false: both returned the same answer at both commits.
  A wrong diagnosis dressed as a process improvement is worse than no lesson, because it gets
  reused.

## Addendum, 2026-08-25: a grep answers a different question than the one you asked

`grep` answers "does this string appear". It never answers "does this thing exist". Three
instances in one day, across three sessions:

- A `grep` of `main` in another repo, run either side of a merge, read as one check being wrong
  when the file had genuinely changed.
- A branch-state check that missed a commit stranded off `main`'s history.
- `grep -c "function hpOwnsEvent()"` returning zero against a function declared as
  `hpOwnsEvent(eventId)`. The function was there; the parentheses were not.

Two techniques that do answer the question, both used to good effect the same day:

- **Diff against a known-good file rather than counting matches.** Normalising the applied
  ruleset and `emulator/firestore.rules` for whitespace and comments, then diffing, proved the
  deployed rules are exactly the ones the 72-case suite runs against. No pattern to get wrong.
- **Construct the check so the hypotheses give different answers.** A production document whose
  `ownerUid`, whose event's owner, and whose `--owner` fallback are all the same string cannot
  tell you which branch produced it. Planting an event owned by a *different* uid makes the two
  outcomes distinguishable, and turns an assumption into an observation.

The general form: before running a check, ask what result the wrong hypothesis would produce. If
it is the same result, the check is decoration. This is the same failure as the retracted
`git log -S` lesson above, which is now three times in one day that confirming evidence was
mistaken for discriminating evidence.
