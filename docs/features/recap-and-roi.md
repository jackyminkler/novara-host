# Recap and ROI

- **Status:** Built, unreleased
- **Released in:** not deployed yet
- **Owner surfaces:** `novara-host`
- **Last mapped:** 2026-08-26

---

## What it does

After an event, the recap is where you write down what happened, once, and every partner gets
their own page from it. Before the event, the same records carry what each side agreed to do
and what the place is going to ask of you.

**Deliverables, both directions.** Every partner card on an event has two short lists: what
they deliver, and what you deliver. Each line has a title, an optional date, and a tick. The
card shows the count without opening anything: "2 of 3 from them, 1 of 2 from you". This is
the effort ledger. An arrangement where one side is quietly doing everything shows up as a
number instead of as a feeling, early enough to say something.

**Spend.** The recap holds a spend log for the event: a line, an amount, whether it was cash
or in-kind, and which partner it sits with. It totals cash and in-kind separately, because a
DJ playing for free is worth saying out loud even though no money moved. Spend is private to
you. It never appears on a guest page or a recap link.

**Where people came from.** When an event's guest list has been imported, the recap groups
signups by the source they arrived through and shows how many signed up from each. Once a
guest export carries check-in times, the same table shows how many actually came and the show
rate per source. Until then it shows the typical rates instead, so you have something to
compare against rather than a blank: about 62 percent from your own reach, 27 from partner
reach, 20 from featured listings.

**Each partner's page.** Every partner section on the recap opens with the goal you recorded
for them, holds up to three outcomes you fill in, and closes with the spend attributed to them
and its total. Goal at the top, what happened at the bottom.

**Attendance stays uncounted.** Your own headcount is the baseline, every person you captured
at the event counts as verified presence, and you can add names you remember. There is no
check-in of any kind and there never will be. Free community events must never feel gated.

**Site lessons.** When a venue is one of the parties on the event, the recap asks what the day
taught you about the place. What you write goes onto the venue, not onto the event, so it comes
back the next time you plan there. The venue's page in your partner directory shows every
lesson with the event it came from, the headcount that needs a permit, whether amplified sound
needs one, and any standing notes. All of it is yours alone.

**Permit and date warnings.** With a venue on the event, the overview shows a quiet chip when
your capacity target passes that site's permit threshold, and another when the site needs a
permit for amplified sound. A second chip appears when one of your other events sits on the
same day, on the overview and beside the date option itself. None of them block anything. They
are the things nobody remembers until the morning of.

**Talk tracks and the shot list.** The overview holds a short list of prompts for the day, in
your words. The run of show holds a shot list: what to photograph and who is holding the
camera, assignable to you, a partner, a crew person, or everyone.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| Deliverables editor | `src/host/event/PartiesTab.tsx` (`DeliverableList`, `ledgerSummary`) | Two lists per party, add, tick, date, remove, and the summary line | Writes the whole `deliverables` array through `updateParty`; a partial write would drop the other direction |
| Due dates | `src/host/event/InlineEditors.tsx` (`DueChip`) | The same picker tasks use, shortcuts relative to the confirmed date | Shared with tasks; a change lands in both |
| Spend log | `src/host/event/RecapEditorPage.tsx` (`SpendCard`) | Event-level rows, cash and in-kind totals, per-partner attribution | Amounts are drafted as strings and parsed on commit; parsing per keystroke turns a half-typed number into zero |
| ROI per party | `src/host/event/RecapEditorPage.tsx` (`PartyOutcomes`) | Goal echo, up to three outcomes, attributed spend and subtotal | Attribution is `SpendEntry.partyId`; removing a party leaves its spend attributed to an id nothing resolves |
| Show rate | `src/host/event/RecapEditorPage.tsx` (`showRateBySource`, `ShowRate`) | Groups this event's registrations by source, counts signups and check-ins | Joins `EventDoc.sourceKey` to `Registration.eventKey`, not to the document id. An event with no `sourceKey` skips the block and skips the `listPeople` read |
| Priors | `src/host/event/RecapEditorPage.tsx` (`ShowRate`) | PRD 5 rates shown only when the event has signups and no check-in data at all | Presenting a prior as a measurement is the failure mode; the copy says "typical" for that reason |
| Site lessons, write | `src/host/event/RecapEditorPage.tsx` (`SiteLessons`) | Appends to the venue org's `siteProfile.lessons` with this event's id | Writes through `updateOrg`, so the whole `siteProfile` is rewritten; read it fresh before appending |
| Site profile, read and edit | `src/host/pages/PartnerDetailPage.tsx` (`SiteProfileCard`) | Lessons with their event, permit thresholds, notes, all editable | Only rendered for `type: 'venue'`; a lesson on a non-venue org would be invisible |
| Permit and contention checks | `src/host/event/siteChecks.ts` | `venueParty`, `permitChecks`, `dateClashes`, `clashedEvents` | The overview and the dates tab both read this; a rule that lives in one screen will disagree with the other |
| Chips | `src/host/event/OverviewTab.tsx`, `src/host/event/DatesTab.tsx` (`OptionHead`) | Warn-toned chips beside the date and the location | Same `warn` tone as the holiday and away warnings, which is what keeps them readable as advisory |
| Talk tracks | `src/host/event/OverviewTab.tsx` (`TalkTracks`) | Add, edit in place, remove; plain strings | Rows are keyed by position and text together, because a plain index leaves a removed line's words in the input below it |
| Shot list | `src/host/event/RunOfShowTab.tsx` (`ShotList`) | Description, owner picker, taken toggle, remove | Owner is an `OwnerRef` and uses the same picker as tasks and the timeline |
| Seam | `src/data/api.ts` | `updateParty`, `updateEvent`, `updateOrg`, `listPeople`, `saveRecap`, `generateRecaps` | No new methods. Everything here rides the generic patches, so both implementations already carry it |
| Storage | `hp_events/{id}` (`spendLog`, `talkTracks`, `shotList`, `capacityTarget`), `hp_events/{id}/parties/{id}` (`deliverables`), `hp_orgs/{id}` (`siteProfile`), `hp_people/{id}` (`registrations`) | Where each part lives | Existing collections only. No new rules, no new index: the show rate reads `listPeople` and groups in memory |
| Analytics | `hp_deliverable_toggled` (direction), `hp_spend_entry_added` (kind), `hp_roi_viewed`, `hp_shot_toggled`, `hp_site_lesson_added` | Whether an agreement written down gets worked, and whether the recap is worth its ten minutes | `hp_roi_viewed` fires once per visit to the editor and only when the block rendered; firing it on mount regardless would count events with no data |

Fields this feature reads or writes are declared in `src/data/types.ts` (`Deliverable`,
`SpendEntry`, `ShotItem`, `SiteProfile`, `SiteLesson`, `EventRecap`, `Outcome`,
`Registration`). This repo has no field registry of its own; `docs/FIELD_REGISTRY.md` lives in
`novara` and covers the consumer app's user record.

---

## Change protocol

Before you touch it:

1. Read this map, and `src/data/types.ts` for the shapes above.
2. Note which surfaces your change touches, and which it *implies*. A field added to
   `Deliverable` implies the guest party view, which renders the same list.

After:

3. Update the rows you changed, in the same commit.
4. Run the gate: `npx tsc --noEmit` and `npm run build`.
5. Regenerate the handbook: `python3 scripts/eng/build_feature_handbook.py`.

**Contract tests guarding this feature:** none specific to it. `tests/ownership.rules.test.ts`
covers `hp_events`, `hp_orgs` and `hp_people` ownership against the emulator, which is what
keeps one host's spend and lessons away from another.

**Invariants:** spend is host side and never reaches a guest page or a recap link. Attendance
is corroborated, never gated: there is no required check-in of any kind, ever (PRD 4.2 F11 and
4.6). Priors are labelled as typical rates and never presented as this event's numbers.

---

## Backward compatibility

- Documents written before M1 carry none of these fields. `firebaseApi` normalises
  `deliverables`, `spendLog`, `talkTracks`, `shotList` and `siteProfile` on read, and every
  reader here still defaults them (`?? []`, `?? null`), because a normaliser is one line away
  from being forgotten.
- `EventDoc.sourceKey` is null on every event created in the workspace. The show rate block is
  absent rather than empty in that case, and the `listPeople` read does not happen at all.
- A spend line attributed to a party that was later removed keeps its `partyId`. It still
  counts in the event totals and simply stops appearing under a partner.
- `SiteProfile` is null on an org that has never had one. Both the recap and the partner page
  substitute a blank profile and write a whole one on the first edit.

---

## Cross-product

| Product | Stake | Status |
| --- | --- | --- |
| `novara` | None. Recap and spend are host coordination and touch no consumer collection | Not built |
| `novara-pulse` | None | Not built |
| Guest surface | Deliverables are written to be read by the party they belong to. The party guest view renders both directions and lets a partner tick their own | Designed, not built |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `2026-08-26` — deliverables and the effort ledger, the spend log, per party ROI with the
  show rate by source, the shot list, talk tracks, permit and date contention chips, and the
  site lessons loop.
