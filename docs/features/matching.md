# Matching

- **Status:** Built, unreleased. Rank only; sparks and pods wait on the engine service
- **Released in:** not deployed yet
- **Owner surfaces:** `novara-host`, `novara-matching`
- **Last mapped:** 2026-08-27

---

## What it does

Matching pairs up the people who signed up for your event. Open an event and go to the Matching
tab. Press "Run matching" and everyone on the list comes back with their closest matches and the
reason each one is a match, in plain words: their paces overlap, they are both free Saturday
morning, they are both in the Marina.

**Where the people come from.** Matching reads the signup list you imported against this event,
and only the people on it who are signed up. Invited and declined are left out. If the event has
no list linked yet, the tab says so and points you at the import on the overview tab. Nothing is
uploaded here and nothing is typed in twice.

**What it scores on.** The answers people gave on your signup form. Five things count: pace, when
they can run, what kind of runs they like, their neighborhood, and the topics they can talk about
or want to learn. Your own question wording is what matters, not a fixed format: a form that asks
"Fastest pace you would run" is understood as a pace question. Anything the form did not ask
simply drops out, and the rest carries the weight. Two people with one answer in common are not
ranked above two people who lined up on everything, because a match built on almost nothing is
held back rather than allowed to win.

**When the form did not ask.** If a signup form asked none of the matching questions, the tab
says that plainly and lists the questions to add next time instead of showing you an empty page.
If it asked some of them, the run goes ahead on those and tells you which parts were skipped. A
person who left every question blank comes back with no matches and a line saying why, rather
than being quietly filed as a bad match.

**Where the mode comes from.** If the event was made from one of your templates, the template
decides how this event pairs people up and the tab says so at the top. If it was not, you pick
here, and the pick lasts as long as you are on the page. Setting it on a template is the durable
way: every event made from that template starts there, and the template also carries the list of
questions the mode needs, which is the part worth getting onto the signup form before the event
rather than after.

**Rank runs now. Sparks and pods do not, yet.** Rank is the one that gives everybody their
closest matches. Sparks (mutual introductions across a room) and pods (splitting a room into
small groups) run on a separate engine that is not connected yet. Choosing one of those shows
you the questions their signup form needs so the answers exist by the time it is, and nothing
else. That is on purpose: those two are the most correctness critical thing we run, and keeping
one copy of them beats keeping two copies in step.

**Who sees results.** Only you. Every run stays with its event, a new run never overwrites an
old one, and nothing from a run appears on a guest page or a partner link.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| Engine | `src/lib/matching/matchcore.js` | Vendored verbatim from `novara-matching/console/matchcore.js`, sha256 `482b9468…`, copied 2026-08-27. Scoring, the pace curve and gate, lower-bound ranking, the parse-rate guard | **Never edit to change behaviour.** Three copies of rank exist (`formats/rank.py` canonical, the Match Console, this one). A change lands in all three or is logged as a divergence in `MATCHING_INBOX.md`. See `MATCHING.md` §12 |
| Engine seam | `src/lib/matching/index.ts` | Types, the serializer, the column report, the byte cap, the stored-payload narrowing. The only file that imports the engine | The engine is a UMD bundle read back off `globalThis`; a bundler change that drops the side-effect import makes it missing at run time, and the wrapper throws rather than scoring blanks |
| Serializer | `src/lib/matching/index.ts` (`peopleToEngineRows`) | Approved registrations for the event's `sourceKey` become rows: `Name`, `Email`, then every answer under its own question text | Renaming answers to canonical keys here would defeat the engine's substring resolver and need a mapping table per host. Rows must share one header set: the engine reads columns off row one alone |
| Column report | `src/lib/matching/index.ts` (`requiredColumnsPresent`, `RANK_COLUMN_NEEDS`) | Which of the five dimensions these rows can feed, and the question to add for each that they cannot | Distinguishes "no guests" from "a form that asked none of the questions". Collapsing the two gives one blank screen for two different problems |
| Tab | `src/host/event/MatchingTab.tsx` | Mode line, run action, guard states, results, run history | The three guards are ordered: no `sourceKey`, then no approved rows, then nothing scorable. Reordering them reports the wrong cause |
| Workspace | `src/host/event/EventWorkspace.tsx` | The Matching tab, after Run of show | |
| Mode source | `Template.matching` via `EventDoc.templateId` | A template names the mode, the profile, and the questions its signup form needs | Labels come from `MATCHING_MODES` / `matchingModeLabel` in `src/data/profiles.ts`, so the library, the editor, event creation and this tab cannot drift |
| Input | `hp_people`, `Person.registrations[]` with `eventKey` and `answers` | The guest list, joined to the event on `EventDoc.sourceKey` | The join is on `sourceKey`, never the document id: slugs are stable, ids are generated |
| Seam | `src/data/api.ts`, `src/data/mock/mockApi.ts`, `src/data/firebase/firebaseApi.ts` | `listMatchingRuns`, `saveMatchingRun`, plus `listPeople` and `listTemplates` | Both implementations move together; mock mode is how this is verified |
| Storage | `hp_events/{eventId}/matching/{runId}`, owner scoped through the event | One document per run, so a later run never overwrites the last | Payloads over 800 kB are refused before the write. Firestore's limit is about 1 MB |
| Rules | Consumer repo `firestore.rules`, the `matching` subcollection block queued in `docs/pending-rules.md` | Owner read and write through `hpOwnsEvent` | **Never a collection-group rule.** `matching` is not `hp_`-prefixed and a collection-group match spans the consumer app's subcollections in the shared ruleset |
| Analytics | `hp_matching_run_started`, `hp_matching_run_completed`, `hp_matching_results_viewed` | Whether pairing people up is a one-off curiosity or something a host comes back to | The feature spec names these without the `hp_` prefix; they carry it here because one naming scheme beats matching a doc |
| Guest surface | none | Results are host only | Nothing in `functions/` or `src/guest/` reads a run, by design |

Shapes live in `src/data/types.ts` (`MatchingRun`, `TemplateMatching`, `Person`, `Registration`).

### The columns rank reads

Resolved case-insensitively by substring against the signup question text, so the host's own
wording is the column name. Any one of them helps on its own; an absent one drops out and the
weights renormalize (`MATCHING.md` §05, and the spreadsheet rule of 2026-08-23).

| Dimension | Engine keys | Fragments that resolve it |
| --- | --- | --- |
| `pace` | `pace_min`, `pace_max`, `pace_bands` | "pace min" / "fastest pace", "pace max" / "slowest pace", "pace band" / "pace you can comfortably" |
| `availability` | `availability` | "available", "availability", "days free", "when can you" |
| `runType` | `run_types` | "run type", "kind of runs" |
| `neighborhood` | `neighborhood` | "neighborhood", "neighbourhood", "area", "location" |
| `topic` | `share`, `learn` | "topics do you have experience" / "can share", "topics would you like to learn" / "want to learn" |

`Name` and `Email` lead every row so a question that happens to contain either word cannot win
the resolver ahead of the real column. Cells are read the way the engine reads them: pace as
`mm:ss` or minutes per mile, everything multi-select as a comma separated list.

---

## Change protocol

Before you touch it:

1. Read `MATCHING.md` at the repo root. It is the single source of truth for the scoring core,
   the dimensions and weights, gates versus weights, the selection modes, and the traps.
2. Read this map. Note which surfaces your change touches, and which it *implies*.

After:

3. Update the rows you changed, in the same commit.
4. **If a matching decision was made, append a dated block to `MATCHING_INBOX.md` in the same
   commit.** Never at session end, and never by hand-editing `MATCHING.md`, which is generated.
5. If `matchcore.js` was touched at all, the change lands in `novara-matching/formats/rank.py`
   and the Match Console too, or the divergence is logged. `tools/drift_check.py` in the engine
   repo checks rank.py against the console on fixture rosters.
6. Run the gate: `npx tsc --noEmit` and `npm run build`, then
   `python3 scripts/eng/build_feature_handbook.py`.

**Contract tests guarding this feature:** `tests/ownership.rules.test.ts` covers the `matching`
subcollection against the emulator. There is no test over the serializer or the column report
yet, and no parity test in this repo: parity lives in `novara-matching/tests/`.

**Invariants:** results are host only. Guests never authenticate and never read a run. Personal
content is data, never code: the mock answers are fictional and every real answer arrives through
the importer.

---

## Backward compatibility

- `MatchingRun.results` is stored as whatever the engine returned and is never interpreted by the
  seam. A run stored by a different engine is detected on read and reported as unopenable rather
  than rendered half empty.
- `engineVersion` is stamped on every run, so an old run can be read back knowing what produced
  it. Changing `ENGINE_VERSION` does not invalidate stored runs.
- Events with no `templateId`, and templates with `matching: null`, both fall through to the mode
  picker. Nothing assumes a template exists.
- Registrations imported before the matching questions existed have empty `answers`. That is the
  "form did not ask" path, not an error.

---

## Cross-product

| Product | Stake | Status |
| --- | --- | --- |
| `novara` | The app engine (`firebase/functions/matching/`) shares the dimension vocabulary and, as of the copy vendored here, the pace shape: a 60 s/mile half-life with a separate 90 s/mile gate. `MATCHING.md` §08 still records the concierge tools as diverged on this; the code in `rank.py` and the console says otherwise, and the code wins. Filed for the next sweep | Aligned in code, doc row stale |
| `novara-matching` | Canonical. `formats/rank.py` is the source this port mirrors; `console/matchcore.js` is the sibling copy. Sparks and pods stay Python-canonical behind a Cloud Run service (M-match-1), which this tab is written to call without changing its shape | Live for rank, service not deployed |
| `novara-pulse` | None | Not built |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `2026-08-27` — M-match-0 shipped: `matchcore.js` vendored at sha256 `482b9468…`, rank running
  in-app on an event's imported guests, runs stored per event, guard states for the three ways
  it comes up empty, and the sparks and pods questions surfaced ahead of the service.
