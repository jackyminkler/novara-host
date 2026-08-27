# Guest CRM

- **Status:** Built, unreleased
- **Released in:** not deployed yet
- **Owner surfaces:** `novara-host`
- **Last mapped:** 2026-08-26

---

## What it does

Two lists, on purpose, because they answer different questions.

**Captures** are the fast inbox. You met someone at an event, you have ten seconds, and you
type a first name and why you want to remember them. The form defaults to the event you are
running and sets a reminder for two days out unless you say otherwise. That is the whole
interaction. A capture is a note to yourself, and it is allowed to be scrappy: no email, no
last name, one line about a mural artist she knows.

**People** is the durable list. It fills from the guest exports your listing page produces, so
it holds everyone who signed up for anything, was invited to anything, or turned something
down, along with what they answered on the signup form. You never type into it. It is history,
and it is the list that answers "who has come twice", "who came but never joined the app", and
"who brought other people".

**Where to find them.** Capture and People, both in the sidebar.

**Bringing a guest list in.** "Import guests" sits on the people page and on an event's
overview. Paste the CSV your listing page gave you, or pick the file. Before anything is
written you see exactly what will change: how many people are new, how many get updated, how
many are already exactly as the file says, and the first few rows so you can tell at a glance
that the right file went in. Then you import.

Every list is stored under an event key, a short dated slug like `2026-09-12-sunrise-run`. When
you import from an event that has no key yet, one is suggested from the event's date and title
and saved onto the event, so the next import of the same list and the event's own recap both
land on the same slug without you retyping it. Keeping a key stable is what lets the same
person be recognised as the same person across four events instead of appearing four times.

Importing the same file twice changes nothing, and it says so: everything reports as unchanged.
A corrected export re-imported replaces that event's entry rather than adding a second one. And
an import never touches what you wrote: your notes, your tags, and your follow-ups on a person
survive every import, because those are yours and the rest is theirs.

Rows with no email address are skipped, and the preview says how many. Email is how the same
person is matched across events, so a row without one has nothing to match on. A file with no
email column at all is refused with an explanation rather than half imported.

**Segments and export.** The people page has five saved segments across the top: came twice or
more, came but not in the app yet, invited and never came, said yes to a waitlist question, and
brought someone. Under them are search, status, event, tag and sort. "Export CSV" downloads
exactly what is on screen after all of that, with names, emails, phones, status, event count,
last seen and tags. What the screen shows is what the file holds: an export that quietly
carried more than you were looking at would be a nasty surprise. Your private notes are never
in it.

**Follow-ups.** The capture page carries one follow-up list covering both sides: the handshake
you have not answered yet and the person on your guest list you meant to write to. Open ones
first, soonest due at the top, each saying where it came from. Tick one off, or reopen it if
you ticked it by mistake.

Every row offers the same default action, "Invite to next event". It copies one short line, the
next event with a confirmed date, where it is, when it is, and the official listing link if one
is recorded, ready to paste into whatever you already talk to that person in. The tool holds
the decision and writes the line. Sending it is still yours. When nothing has a confirmed date
yet, the action says so instead of copying something wrong.

**Turning a capture into a person.** A capture you want to keep gets "Add to people" on its
detail, which folds it into the durable list: the name, the handles, the note underneath
anything already there, and a "met in person" tag so you can find everyone you met this way.
Someone already on the list, matched by email, is merged rather than duplicated. Afterwards the
capture says "View in people" instead, which is the whole guard: a capture with no email has
nothing to match on, so offering the action twice would quietly make two of the same person.

Someone promoted this way shows as invited rather than signed up. They are on your list without
having registered for anything, which is true, and it corrects itself the first time a real
guest export carries them.

**People and app accounts.** A person on your list can be linked to a Novara app account, and
the page says whether they are. It is a link, not a copy. Their account is theirs and lives in
the app. Your notes about them are yours and stay here.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| Capture inbox | `src/host/pages/CapturePage.tsx` | Quick add, the capture rail, one capture's detail, the promote action | The quick add is the only writer of `hp_contacts` in the app; a field added to the shape has to be defaulted here and in both seam implementations |
| Follow-up hub | `src/host/pages/CapturePage.tsx` (`FollowUpHub`, `nextConfirmed`, `inviteLine`) | Merges capture and person follow-ups into one list; copies the invite line | The two sources are separate documents with the same debt; splitting the view again is how one half stops being read |
| People list | `src/host/pages/PeoplePage.tsx` | Loads every person once, filters in memory, exports the filtered view | Two of the segments cannot be Firestore queries at all, so a move to server-side filtering would silently drop them |
| Segments | `src/data/segments.ts` | The five saved questions, as pure functions over the loaded set | Deliberately generic: no partner name, question text or event key belongs here (PRD guardrail 6) |
| Export | `src/data/people/export.ts`, `src/data/people/csv.ts` (`toCsv`) | Serialises the filtered view; escaping is the inverse of the parser | Exporting more than the screen shows is a privacy surprise, not a feature |
| Person detail | `src/host/pages/PersonDetailPage.tsx` | Registration history, and the only three fields a host may edit | Everything above the notes card is derived by the importer and would be undone on the next import |
| Import dialog | `src/host/people/ImportGuestsDialog.tsx` | Paste or pick, parse, dry-run preview, import, and the suggested event key | The preview runs the same merge the import runs, against the same list; any other counting is a second implementation of "what will this change" |
| Import entry points | `src/host/pages/PeoplePage.tsx`, `src/host/event/OverviewTab.tsx` | The two doors into the same dialog | Opened from an event, the import also writes `sourceKey` back, which is what the recap's show-rate table joins on |
| Parser | `src/data/people/csv.ts` | RFC 4180 read and write, BOM stripped, quoted newlines handled | Column names in these exports contain commas and newlines; splitting on commas corrupts the header and every row after it |
| Merge semantics | `src/data/people/merge.ts` | Email is the dedupe key, tier is precedence, host fields are never cleared, an event's entry is replaced rather than appended | The seed importer and the in-app importer share this module; a second copy would drift the first time one was fixed |
| Command line importer | `seed/import-luma-guests.ts` | The same merge, for a first bulk load, with `--offline` and `--dry-run` | Loads the two modules above directly under Node type stripping, so neither may gain a runtime import |
| Promotion | `src/data/people/merge.ts` (`personFromContact`), both seam implementations | Builds or merges a person from a capture and stamps `personId` back on the capture | Without the link back, a capture with no email promotes twice into two people |
| Seam | `src/data/api.ts`, `src/data/mock/mockApi.ts`, `src/data/firebase/firebaseApi.ts` | `listContacts`, `createContact`, `updateContact`, `listPeople`, `getPerson`, `updatePerson`, `importPeople`, `promoteContactToPerson` | Both implementations must move together; mock mode is how the UI is verified |
| Storage | `hp_contacts/{contactId}`, `hp_people/{personId}`, both owner scoped by `ownerUid` | One document per capture, one per person with registrations embedded | Registrations are embedded because they are bounded and every read of a person wants the history; a subcollection would need a collection-group rule, which is banned |
| Rules | Consumer repo `firestore.rules`, `hp_contacts` and `hp_people` blocks | Owner read and write | This repo never deploys rules. A new collection or index goes to `docs/pending-rules.md` first |
| Analytics | `hp_capture_created`, `hp_followup_done`, `hp_people_list_viewed`, `hp_person_viewed`, `hp_person_note_saved`, `hp_people_exported`, `hp_csv_import_completed`, `hp_followup_invite_copied`, `hp_person_promoted` | Whether a list that took an import ever gets used again | Renaming one breaks the only evidence the CRM earned its place |
| Identity link | `Person.appUserUid` | Names the consumer app account this person turned out to be | A link, never a copy. Host notes must not flow into the identity |

Fields this feature reads or writes are declared in `src/data/types.ts` (`CapturedContact`,
`Person`, `Registration`, `PersonTier`). This repo has no field registry of its own;
`docs/FIELD_REGISTRY.md` lives in `novara` and covers the consumer app's user record.

---

## Change protocol

Before you touch it:

1. Read this map, and `src/data/types.ts` for the shapes above.
2. Note which surfaces your change touches, and which it *implies*. A change to the merge rules
   implies the command line importer, the in-app importer, the preview, and promotion.
3. `src/data/people/csv.ts` and `src/data/people/merge.ts` are loaded directly by Node under
   type stripping. They may import types and nothing else.

After:

4. Update the rows you changed, in the same commit.
5. Run the gate: `npx tsc --noEmit` and `npm run build`.
6. Regenerate the handbook: `python3 scripts/eng/build_feature_handbook.py`.

**Contract tests guarding this feature:** `tests/ownership.rules.test.ts` covers `hp_contacts`
and `hp_people` ownership against the emulator. There is no test over the merge itself yet; the
`--offline` mode of the command line importer is the closest thing, and it is manual.

**Invariants:** guests never authenticate and never touch Firestore, so nothing here is guest
facing (CLAUDE.md, hard rules). Personal content is data, never code: no real name, event key
or question text belongs in application code (PRD build guardrail 6).

---

## Backward compatibility

- Captures created before M1 have no `quote`, `voiceNote` or `personId`. `firebaseApi`
  normalises all three on read; nothing else may assume they are present.
- `personId` is not part of `ContactInput`. Only `promoteContactToPerson` sets it, so a page
  cannot claim a capture was promoted when no person exists.
- People documents predate `tags` and `followUp` on nobody: the collection was created by the
  importer with the full shape. A person promoted from a capture can still have an empty
  `email`, which is the one case the dedupe key is absent, and every list read tolerates it.
- Re-importing an export written before a column existed leaves the newer fields alone, because
  every derived field is recomputed from the union of stored and incoming registrations.

---

## Cross-product

| Product | Stake | Status |
| --- | --- | --- |
| `novara` | Real. `Person.appUserUid` names a consumer app account, and the host's list is the supply side of the consumer bridge in PRD M3. The link is written by `seed/link-app-users.ts` and read nowhere else; host notes never flow into the identity | Designed, one direction only |
| `novara-pulse` | None | Not built |
| `novara-matching` | Registrations carry the signup answers a matching run scores on, so a run with the wrong event key has nothing to read | Designed, engine not connected |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `2026-08-26` — the guest CRM completed: CSV export of the filtered view, the in-app importer
  with a dry-run preview on both the people page and an event overview, one follow-up hub over
  captures and people with a copyable invite line, and promotion from a capture with the
  `personId` link that makes it a one-time action.
