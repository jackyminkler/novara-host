# Handoff work order: save an event as a template

**Date:** 2026-08-31. **Repo:** novara-host. **For:** a new contributor's first piece of work.
**Shape:** one warm-up lap of about two hours, then one weekend-sized feature.
**Status:** pre-build. Nothing in it needs Jacky's credentials, a rules change, or a deploy.

## Why this piece

The host MVP is operational planning, and the host pays for it on a subscription. That decides
which unbuilt thing matters: not what the tool stores, but what it solves. For a recurring host
the thing worth paying for is that **the second event costs a fraction of the first one**.

Today it does not. Templates materialise into an event, with role slots, a task skeleton on
relative offsets, and a run of show, and `NewEventPage` does that well including rush compression.
The return path does not exist. `listTemplates()` is the only template method on the api seam:
there is no create, no update, no delete. Templates can only enter through the seed script, which
means a host who runs a great event and wants to run it again rebuilds it by hand. `build-log.md`
records this as parked, per PRD 4.6, and PRD 5 lists it under M1.

`Template.createdFrom` already has an `'event'` case declared. Nothing has ever produced it.

**Why this piece for a new person.** It is the inverse of a transform that already exists, so the
existing code is the specification: reading `NewEventPage.tsx` and `src/lib/dates.ts` teaches the
data model faster than any document. It is data-shaped rather than design-shaped. It cannot reach
the consumer app. And `hp_templates` already carries a deployed rules block allowing create under
`hpOwnsNew()`, so there is no waiting on anyone.

---

## Warm-up: the event category field, about two hours

`hp_events` has no category. It is one field, and if it is not captured from now on the data never
exists retroactively. It is on the strategy backlog as its own item for that reason.

The point of doing it first is that it walks the whole stack in one pass: `types.ts`, the `api.ts`
seam, both implementations behind it, one form field, and the build gates.

- Add `category: string` to `EventDoc` in `src/data/types.ts`. Free text, not an enum. A closed
  list needs a taxonomy decision that has not been made, and the field is worth more existing
  loosely than not existing.
- Set it on create in `CreateEventInput` and in both `mockApi` and `firebaseApi`, defaulting to
  the empty string so existing documents read cleanly with no backfill.
- Add the input to the basics step of `NewEventPage.tsx` and make it inline editable on the
  overview tab, per PRD 4.7: everything the host sees, the host can edit.
- No new rules block and no index. It is a field on a document that already has both.

**Done when** `npx tsc --noEmit` and `npm run build` pass, a new event created in
`npm run dev:mock` carries a category, and the field survives an edit and a refetch.

---

## The main piece: save this event as a template

### Read these first, in this order

1. `src/host/pages/NewEventPage.tsx`, the template picker and the create flow.
2. `src/lib/dates.ts`, specifically `materializeOffsets` and `isRushRunway`.
3. `src/data/mock/seed.ts`, the two seeded templates. That is the shape you are producing.
4. `src/data/types.ts`, `Template`, `RoleSlot`, `TaskSkeletonItem`, `RunSkeletonItem`.

The forward transform is template to event. You are writing the inverse. Where the two disagree,
the forward one is right and yours is wrong, because the forward one has run against real events.

### The work

1. **One new api method.** `createTemplateFromEvent(eventId: string, name: string): Promise<string>`
   in `src/data/api.ts`, implemented in both `mockApi` and `firebaseApi`. It reads the event
   bundle, builds a `Template`, writes it to `hp_templates` with `createdFrom: 'event'`, and
   returns the id. `hp_templates` already permits create under `hpOwnsNew()` in the deployed rules,
   so stamp `ownerUid` and nothing else is needed.

2. **The inverse transform**, in a new `src/lib/templates.ts` with unit tests. Four conversions,
   and the second and third are the interesting ones:

   - **Tasks to `taskSkeleton`.** A task materialised from a template still carries `offsetDays`,
     so those come back free. A task the host added by hand carries `offsetDays: null` and a real
     `dueDate`: derive its offset as days from the confirmed event date. A task with neither is
     dropped, not guessed. Preserve `note`, drop `status` and `order` beyond sort position.
   - **Run of show to `runOfShowSkeleton`.** `RunItem` carries a clock `time`; the skeleton carries
     `offsetMinutes`. You need an anchor. Use the first item's time as minute zero and express the
     rest relative to it, then record that start time in `Template.defaults.startTime`. Write down
     in `build-log.md` why you chose that anchor, because it is a judgment call and the next person
     will want to know.
   - **Parties to `roleSlots`.** This is the one to get right. A slot is a role label plus an
     `orgType`, never a specific org. **Do not carry the org id, the org name, or any contact into
     the template.** CLAUDE.md's rule that personal content is data and never code applies here in
     a new place: a template that remembers "Andytown Coffee" is Jacky's content baked into a
     reusable object, and it would follow the template to any host she ever shares it with. Set
     `required: false` for every slot; which ones are mandatory is a template-editor decision and
     the editor is not in this task.
   - **Defaults.** `capacityTarget` from the event. `durationMinutes` from the run of show span,
     or omitted if there are fewer than two items. `startTime` per above.

3. **The round-trip test.** This is the acceptance test worth writing first. Take a seeded
   template, materialise it into an event through the existing path, save that event back to a
   template, and assert the skeleton matches the original: same task titles and offsets, same run
   order and relative minutes, same slots. Anything that does not survive the round trip is either
   a bug in your inverse or a deliberate loss you should name in the test.

4. **The action.** A "save as template" control on the event overview tab. It asks for a name,
   defaulting to the event title, and shows what will be captured before it writes: the counts of
   slots, tasks and run items, and one line stating that partners and dates are not carried over.
   Confirm, write, and surface it. No new page.

5. **It has to show up.** After saving, the template appears in the picker on the next event
   create. That is the whole point, and it is the one thing to verify by hand in `npm run dev:mock`
   before calling this done: create an event from a seeded template, change it, save it as a new
   template, start a second event from that new template, and see the changes carried through.

6. **One Amplitude event.** `hp_template_saved_from_event`, with `eventId` and the three counts.

### Explicitly not in this task

- **No template editor.** Renaming, reordering, editing offsets, marking slots required, deleting.
  That is the larger half of the M1 item and it needs its own screen. Saving is the half that
  delivers most of the value on its own.
- No versioning, no "update the template I started from", no diffing an event against its template.
- No sharing a template between hosts. Templates are `ownerUid` scoped and stay that way.
- No change to the seeded templates, to the materialisation path, or to anything outside `hp_`.
- Nothing guest-facing.

### Definition of done

The standing definition in `CLAUDE.md` applies in full. Specifically:

1. `npx tsc --noEmit` and `npm run build` both pass.
2. The round-trip test passes, and the unit tests for `src/lib/templates.ts` cover the
   hand-added-task case, the single-run-item case, and an event with no parties.
3. It works end to end in `npm run dev:mock` with no Firebase, which means the mock implementation
   is real and not a stub.
4. Every new string passes the copy rules: no em dashes, sentence case, no "engagement", nothing
   that describes an output as a list of people.
5. The five states are defined for the new control: nothing to save, saving, saved, error, and the
   already-exists case if a template of that name is already there.
6. No hex is hardcoded in a component. `src/index.css` still carries the retired A.1 palette, so
   match the tokens already in use and do not copy any violet forward into new code.
7. `docs/build-log.md` gains a dated entry recording the run-of-show anchor decision, anything
   deliberately lost in the round trip, and the fact that the editor is still parked.
8. Nothing was written to `docs/pending-rules.md`, because nothing here needs it. If that turns out
   to be wrong, stop and surface it rather than proposing a rules change.

---

## Orientation

Run `npm run dev:mock` before reading anything. The whole app works with no backend and no
credentials, which is the fastest way to see what any of the above refers to.

Then: `CLAUDE.md` in full, it is short and it is the contract. Then PRD sections 3.3, 4.2 F3,
4.6 and 4.7. Then `docs/build-log.md` from the bottom, which is the honest history including the
bugs and is the best single read in the repo.

---

**Context added 2026-09-01.** This piece is step 7 of the flow in
`docs/Recurring_Event_Cycles_Flow_v1.md`: improvements made while planning one occurrence are
saved back to the template so the next occurrence starts from the better version. It stands alone
and can still be built alone, but read the flow doc first for why it matters.
