# Templates

- **Status:** Built, unreleased
- **Released in:** not deployed yet
- **Owner surfaces:** `novara-host`
- **Last mapped:** 2026-08-26

---

## What it does

A template is your plan for a kind of event: the roles you need filled, the tasks that have to
happen and how far ahead of the day each one lands, the run of show minute by minute, and the
defaults you always start from. Templates are yours. Nothing ships with the product, and
nothing you write in one is visible to anyone else.

**Where to find them.** Templates in the sidebar, between Events and Calendar. Every template
you have shows its name, what is in it, and where it came from: seeded when it was loaded into
your account at setup, from an event when you saved one, or started blank.

**Making one.** Two ways. "New template" gives you an empty one and opens it for editing. Or
plan an event the way you want it, then open its overview and use "Save as template": the
tasks, the run of show, and the roles come across as they stand. Dates become offsets from the
event day, so the plan is reusable rather than stuck to one morning. Partner names stay behind.
A slot that said a partner's name in the event becomes the role they played, and you choose who
fills it next time.

**What you can change.** Everything, in the template editor:

- **Name and description**, so you know which plan this is at a glance.
- **Defaults**: start time, how long it runs, and the capacity you aim for. These fill in when
  you create an event and stay editable there.
- **Role slots**: the roles this kind of event needs. Each slot has a name you write yourself, a
  partner type, and a required or optional mark. Required only means the flow reminds you. You
  can always plan solo, and a template with no slots at all is a perfectly good checklist.
- **Tasks**: what has to happen, with a day offset. Minus 14 means two weeks before the event,
  2 means two days after. The order you put them in is the order they appear on the board.
- **Run of show**: the morning in order, each item a number of minutes from the start time.
  Minus 45 is 45 minutes before, 90 is an hour and a half in.
- **Matching**: whether this kind of event pairs people up, which profile it scores on, and the
  signup questions those answers have to come from. Rank runs today. Sparks and pods are
  written down here so the questions get onto the signup form, and they start working when the
  matching service is connected.

Renaming a slot carries the tasks and run of show items assigned to it, so nothing quietly
loses its owner. Removing a slot leaves anything assigned to it showing as no longer a slot, so
you can see what to reassign rather than having it silently become yours.

Changes save when you press "Save template". Until then the editor says you have unsaved
changes, and leaving asks first.

**Using one.** Start a new event and pick a template on the first step. Its role slots become a
partner picker, its defaults fill the basics, and the tasks and run of show arrive in the
workspace right away. Tasks get their real dates when you confirm one of the date options. If
the event is close, the early tasks compress into the runway you actually have instead of
landing in the past. Everything is editable in the event afterwards, and editing the event
never changes the template.

**Removing one.** The remove control on a template card, which asks first. Events already made
from it keep everything they were given.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| Library | `src/host/pages/TemplatesPage.tsx` | Lists templates, creates a blank one, deletes with a confirm | The blank shape lives here (`blankTemplate`); a field added to `Template` and not defaulted here creates documents the editor reads as missing |
| Editor | `src/host/pages/TemplateEditorPage.tsx` | Whole-template edit: name, description, defaults, slots, task skeleton, run skeleton, matching config | Draft holds numbers as strings and drops blank keys on save; writing `undefined` into `defaults` would be rejected by Firestore |
| Slot references | `src/host/pages/TemplateEditorPage.tsx` (`renameSlot`, `ownerSlotOptions`) | Skeleton items address a slot by name, so renames propagate and deleted slots stay visible | A second identity scheme for slots would diverge from the stored format, which is name keyed |
| Save as template | `src/host/event/OverviewTab.tsx` | Names the new template and hands the host its editor | Derivation is not here; it is in the seam |
| Derivation | `src/data/instantiate.ts` (`templateFromEvent`) | Turns an event's tasks and run of show into offsets against its confirmed or first proposed date, and parties into role labels | Changing the anchor rule changes every offset in every template saved afterwards |
| Materialisation | `src/data/instantiate.ts` (`tasksFromTemplate`, `runItemsFromTemplate`, `materializeTasks`) plus `src/lib/dates.ts` (`materializeOffsets`) | Skeletons become real tasks and run items; dates arrive on confirm, compressed on a short runway | Rush mode lives in `materializeOffsets`; dropping it puts template tasks in the past on a two week runway |
| Event creation | `src/host/pages/NewEventPage.tsx` | Template picker, slot to partner assignment, defaults prefill, matching mode chip | Reads `listTemplates`, which returns every template the host owns, seeded and user made alike |
| Seam | `src/data/api.ts`, `src/data/mock/mockApi.ts`, `src/data/firebase/firebaseApi.ts` | `listTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `saveEventAsTemplate` | Both implementations must move together; mock mode is how the UI is verified |
| Storage | `hp_templates/{templateId}`, owner scoped by `ownerUid` | One document per template | A list query that stops filtering on `ownerUid` crosses hosts |
| Rules | Consumer repo `firestore.rules`, `hp_templates` block, applied 2026-08-20 | Owner read and write | This repo never deploys rules. A new collection or index goes to `docs/pending-rules.md` first |
| Analytics | `hp_template_created`, `hp_template_edited`, `hp_template_deleted`, `hp_event_saved_as_template` | Whether a host reuses a plan at all | Renaming one breaks the only evidence save as template earned its place |
| Matching | `Template.matching` (`mode`, `profileName`, `requiredQuestions`) | Declared here, read by the event's Matching tab ([`matching.md`](matching.md)) | Nothing in the editor couples to the engine; it names a mode and lists questions. The mode a template declares is what an event made from it runs, so a mode renamed here changes what that tab offers |

Fields this feature reads or writes are declared in `src/data/types.ts` (`Template`, `RoleSlot`,
`TaskSkeletonItem`, `RunSkeletonItem`, `TemplateMatching`). This repo has no field registry of
its own; `docs/FIELD_REGISTRY.md` lives in `novara` and covers the consumer app's user record.

---

## Change protocol

Before you touch it:

1. Read this map, and `src/data/types.ts` for the shapes above.
2. Note which surfaces your change touches, and which it *implies*. A field added to `Template`
   implies the blank shape, the editor, the derivation, and both seam implementations.

After:

3. Update the rows you changed, in the same commit.
4. If a matching decision was made, append a dated block to `MATCHING_INBOX.md` in the same
   commit. Never hand edit `MATCHING.md`.
5. Run the gate: `npx tsc --noEmit` and `npm run build`.
6. Regenerate the handbook: `python3 scripts/eng/build_feature_handbook.py`.

**Contract tests guarding this feature:** `tests/ownership.rules.test.ts` covers `hp_templates`
ownership against the emulator. There is no test over the derivation or the offsets yet.

**Invariants:** templates are user data, never application code (CLAUDE.md, hard rules). A
template carries no partner names and no personal content.

---

## Backward compatibility

- Templates created before M1 have no `matching` field. `firebaseApi` normalises it to null on
  read; nothing else may assume it is present.
- `defaults` keys are all optional and are omitted rather than written as undefined, so a
  template saved by the editor can be missing any of them.
- Skeleton `note` and `notes` are omitted when blank, matching what `templateFromEvent`
  produces, so a template saved either way reads the same.
- Templates seeded into an account keep `createdFrom: "seed"` and are editable like any other.
  Editing one does not change what it says it came from.

---

## Cross-product

| Product | Stake | Status |
| --- | --- | --- |
| `novara` | None. Templates are host coordination and touch no consumer collection | Not built |
| `novara-pulse` | None | Not built |
| `novara-matching` | `Template.matching` names a mode and a profile the engine reads. The names must match the engine's own, and the required questions must reach the signup form for a run to have anything to score | Live for rank, which runs in-app on the vendored engine. Sparks and pods still wait on the service |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `2026-08-26` — templates became editable: library page, editor, save as template from an event
  workspace, and matching configuration declared on the template. Read only before this.
- `2026-08-27` — `Template.matching` stopped being a declaration only. An event's Matching tab
  reads it for the mode, the profile, and the questions to put on the signup form.
