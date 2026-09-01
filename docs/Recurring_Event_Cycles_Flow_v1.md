# Recurring event cycles: flow, entities and seams, v1

**Date:** 2026-08-31. **Repo:** novara-host. **Status:** design, pre-build.
**Purpose:** the target flow for planning a repeating event with a cohost, the entity model it
needs, and where the existing code already reaches. Written to be handed to a contributor whole,
with one seam named as the place to start.

---

## 0. The prior decision, found and re-tested

> **Superseded in part, 2026-09-01, and the correction sits at the other end of this file.**
> This section concludes "not now" about a shared service. Section 7 and
> [`docs/adr/0001-one-solver-two-doors.md`](adr/0001-one-solver-two-doors.md) reopened it the
> same day, because the trigger this section names, the consumer app needing this derivation,
> turned out to have already arrived. The reasoning below is kept exactly as written: it is
> still the clearest statement of the case against a service, and anyone weighing ADR-0001's
> Option G needs it. Read it as one side of an open question, not as the standing answer.

There was a decision not to put the calendar work behind a shared service. It is in
`docs/build-log.md`, in the entry that begins "It lives in this repo, not in `novara-matching`,
and not in a new service," which is why it is hard to find: it was never written to a decisions
doc.

The reasoning, restated:

> The feature is three parts with different portability. Calendar ingest is Google-specific and
> needs a server, and is not reusable. Derivation is a pure calculation. The booking surface is
> different in each app anyway. **Only derivation is worth sharing, and a pure function is shared
> by moving a file, not by adding a network hop.** It lives in `src/lib/availability/` with no
> firebase, react, clock or network imports, so it lifts into a package unchanged when the
> consumer app wants run booking.

Plus: a service was premature at one app and one user, and would have added a third repo to a
rules-deploy handoff that had already stranded changes off `main` twice in one day.

**Does it still hold?** For the four seams in this document, yes: they are host-side and
single-repo, and none of them is blocked on the service question. For the solver underneath them,
no. See section 7.

**The one assumption worth flagging.** "Lifts into a package unchanged" is true between
JavaScript codebases. The consumer app is Flutter, so a TypeScript package does not lift into it
by a file move. That does not make the decision wrong, it means the trigger for revisiting is
narrower than it reads: revisit when the **consumer app** needs this derivation, not when the
host app grows. At that point the choice is a service or a Dart port, and `MATCHING.md`'s one
engine no fork rule already argues for the service. **That point arrived on 2026-09-01, which is
what section 7 records.** The sentence that stood here, "Not now", was wrong within a day of
being written, and it is left visible rather than deleted because the speed of that reversal is
itself worth knowing.

---

## 1. The flow, in the host's words

> I run "Girls run + brunch" with Circe. I want a new one every 4 to 6 weeks on a Saturday, with a
> week either side if it has to be 3 or 7, so I can plan Q4. I want to send Circe one link where they either connect a calendar or
> just mark the dates they can and cannot do, inside the scope I set. Out of that I want real
> dates and a working event to plan from, at least for the next one. And when I improve the plan
> while running October's, November should start from the improved version.

Step by step:

1. Host picks a template and says: repeat it, inside a window, at a spacing. The window is a
   scope, "October 1 to December 31". The spacing is a rule, "every 4 to 6 weeks, stretch to 3 or
   7 if it has to, not the week of Thanksgiving". The two are independent: the window bounds the
   search, the rule constrains the gaps between whatever is chosen inside it.
2. That creates a **cycle**: the template, the cadence, the horizon, and the parties. It holds
   three **occurrences**, each of which is a target window rather than a date.
3. Host sends the cohost one link, scoped to the cycle rather than to an event. The cohost either
   connects a calendar or marks days in or out by hand, inside the horizon only.
4. Each occurrence ranks its candidate Saturdays across host and cohost free time, and says who
   can make each one.
5. Host confirms the nearest occurrence. That materialises a real event from the template, with
   its own event page, task skeleton on real dates, and run of show.
6. The later occurrences stay flexible and keep re-ranking as either calendar changes, until each
   is confirmed in turn.
7. Improvements made while planning October are saved back to the template, so November starts
   from the better version.

---

## 2. The entity model

Four objects, and the discipline is that **none of them duplicates another**.

| Object | What it is | Lifetime |
|---|---|---|
| **Template** (`hp_templates`, exists) | The reusable shape: role slots, task skeleton on relative offsets, run of show, defaults. No dates, no named partners | Forever, edited over time |
| **Cycle** (`hp_cycles`, **new**) | A commitment to repeat one template with specific parties over a horizon, at a cadence, with a tolerance | Until the horizon ends |
| **Occurrence** (embedded in the cycle, **new**) | One instance in the cycle. Either a flexible target window with ranked candidates, or a pointer to a confirmed event | Becomes a pointer on confirm |
| **Event** (`hp_events`, exists) | One real instance being planned and run | Forever |

**The rule that keeps this from becoming a second planning surface:** an occurrence carries no
plan of its own. Before confirmation it holds a window, a candidate ranking and the responses.
On confirmation it materialises an event through the existing creation path and from then on
holds only `eventId`. There is one event object and one place to plan.

**Why a cycle is not just a recurrence rule on an event.** A recurrence rule assumes the dates
are known. The whole value here is that they are not: the dates are the output, and they arrive
one at a time as people answer. A cycle is a container for an unresolved question, which is the
same shape as a plan with an unresolved *when* in the consumer model.

---

## 3. What already exists

More than expected. Read these before designing anything.

| Piece | Where | State |
|---|---|---|
| Interval algebra, merge, subtract, pad | `src/lib/availability/windows.ts` | Done, tested |
| Free-window derivation from a calendar, with the judgment layer for travel and evenings | `src/lib/availability/derive.ts`, `spread.ts` | Done, tested |
| **Multi-party ranking**, `coverage()` and `suggest()` | `src/lib/availability/coverage.ts` | Done, 24 tests. Ranks by turnout, then template time of day, then soonest, one option per day |
| Weekday filter and preferred start time in `suggest` | same | Done. A Saturday-only monthly cadence is already expressible |
| Google Calendar read, freebusy scope for guests | `googleEvents.ts`, `src/host/googleCalendar.ts` | Done |
| ICS import, read in the browser and discarded | `ics.ts` | Done |
| A guest surface that derives free time locally and sends only windows | `src/guest/HuddlePage.tsx`, `HuddleParticipant.free` | Done |
| Capability tokens with a scope, including one that is not about an event | `hp_guestTokens`, `booking` scope | Done. The precedent for a cycle-scoped token exists |
| Template to event materialisation, with rush compression | `NewEventPage.tsx`, `src/lib/dates.ts` | Done |

**`suggest()` is already the solver this flow needs.** Its own header calls it "the primitive
under every multi-party surface: suggesting dates for an event, a template asking for the next
three Saturdays that work, and a group huddle." The third case is this document.

---

## 4. The four seams

Two of these are already recorded as not done in `docs/Availability_Feature_Plan_v1.md` §3. That
is the strongest signal that this flow is the right next thing: it is mostly joining things that
already exist.

### Seam 1. A settled group answer becomes an event

**Named as not done:** "Settling a huddle does not create an event. `settledStartsAt` exists on
the huddle and the guest page renders the settled state, but no host control sets it and nothing
turns it into an event. It should feed the existing event-creation flow rather than a second
path."

Smallest of the four, entirely inside existing objects, and it closes a loop that currently
dead-ends. **This is where to start.**

### Seam 2. Partner free windows are retained, not just per-date answers

**Named as not done:** "Partner calendar answers are per-date only. A partner connecting their
calendar answers the proposed dates yes or no. Their free windows are not retained, so `suggest`
cannot yet rank dates across host plus partners. The pieces exist; nothing joins them."

This is the joint the whole flow turns on. The huddle path already retains windows, so the
pattern exists and the work is making the party path match it.

**Privacy line, non-negotiable and already established:** windows leave the device, events never
do. `hpGuestView` computes and returns slots server side, and huddle participants derive in their
own browser. Store free windows, never calendar events, and never the titles.

### Seam 3. Cadence: N occurrences over a horizon instead of one slot

`suggest()` answers "the best few slots." A cycle asks "one good Saturday per month for three
months, give or take two weeks." That is a wrapper: partition the horizon into target windows,
run `suggest` inside each with `weekdays` and `preferredStart` from the template, and never
return two occurrences from the same window.

New pure functions in `src/lib/availability/`, existing ones untouched.

### Seam 4. The cycle object and its surface

`hp_cycles`, the occurrence list, the cycle-scoped token, and the screen that shows a template,
its cadence, and three occurrences in their different states. This is the largest piece and the
only one needing a new collection, so it also needs a block written to `docs/pending-rules.md`
and applied by Jacky through the consumer repo. Sequence it last for that reason.

---

## 5. What to hand off

**Hand over this whole document, and name seam 1 as the start.** Reasons: seams 1 and 2 are
already written down as owed, so the work is joining rather than inventing; seam 1 touches no new
collection and so needs nothing from Jacky; and seeing the whole flow is what lets a contributor
judge whether their piece has the right shape, which matters more than the size of the piece.

Ask for a sequencing proposal back before seam 3 starts. Seams 3 and 4 have real design latitude
and a second opinion on them is worth more than speed.

**Boundaries that apply to all four seams:**

- `CLAUDE.md` in full. Especially: everything through the `api.ts` seam, mock implementations that
  actually work, `ownerUid` on every top-level `hp_` document, no rules deployed from this repo,
  and the copy rules on every string.
- Do not modify `src/lib/availability/coverage.ts`, `windows.ts`, `derive.ts` or `spread.ts`.
  Add alongside them. Those files carry the defect history described in the strategy docs, where
  99 passing tests still hid real defects across two adversarial reviews, and additive change is
  what keeps that risk near zero.
- Nothing in the consumer app, and no `hp_`-prefixed name that is actually an Amplitude event
  rather than a collection. There are 15 of those.
- A cycle's occurrence never holds tasks, a run of show, or a recap. If it starts to, the model
  has drifted and the answer is to materialise the event earlier.

---

## 6. Open questions, for Jacky

1. ~~Tolerance semantics.~~ **Answered 2026-09-01: a bounded window plus a spacing rule in weeks,
   and they are orthogonal.** Window is the scope to search. Spacing is target 4 to 6 weeks,
   stretch to 3 or 7 when needed, plus named blackout ranges. The same spacing field expresses
   "every week with Vicki" and "every 4 to 6 weeks with Circe", which is what makes the host and
   consumer cases one object.
2. **What happens when an occurrence has no good answer.** Silent, or an explicit "no Saturday in
   November works for both of you, here is the closest"? The product's existing instinct is to
   name the missing input rather than render nothing.
3. **Does a cohost see the other occurrences?** One link covering three months is convenient and
   it also shows the cohost a quarter of the host's calendar shape. Scope per occurrence or per
   cycle is a real choice.
4. **Whether a cycle can outlive its template.** If the template changes in November, does
   December's occurrence follow the new one or the version it was created under.


---

## 7. Amendment, 2026-09-01: this is a shared object, and it needs a service

Two things changed after v1 was written.

**The cadence is a window plus a spacing rule, and the two are orthogonal.** v1 posed these as
alternatives, which was wrong. The **window** is the scope: October 1 to December 31, or the next
90 days. The **spacing rule** operates inside it: a target gap of 4 to 6 weeks, stretch to 3 or 7
when needed, named blackouts. "Plan Q4" is a window that happens to yield two or three occurrences
under a 4 to 6 week rule; "run with Vicki about weekly" is a rolling window with a 1 week rule.
One model covers both, and neither the window nor the rule is optional.

Seam 3 is therefore: partition a window under a spacing rule, run `suggest` inside each resulting
slot, and never place two occurrences closer than the minimum gap.

**The consumer app needs the same object.** The host's recurring cycle with a cohost and the
consumer's standing intention with a friend are the same thing: known party, known activity,
unresolved date, cadence as a range. Held against the other intent shape in the product:

| | who | when | what |
|---|---|---|---|
| Open intent, F7b | **unresolved** | roughly known | known |
| **Cadence intent**, this document | known | **unresolved** | known |
| Plan | known | known | known |

Same scheduler, same solver, different empty field. The host surface calls it a cycle over a
template with a cohost. The consumer surface calls it running with Vicki about once a week. The
vocabulary differs and the object does not, which is the same profile-driven pattern the matching
engine already uses.

**Therefore the solver gets a service door.** The decision, the alternatives and the constraints
are in `docs/adr/0001-one-solver-two-doors.md`. In short: one TypeScript module, imported directly
by JavaScript callers and wrapped by a callable Function for everything else. Ingest and derivation
stay on the device. Only intervals and constraints cross the wire, which is a stricter privacy
boundary than the one in place today.

**What this changes about the seams.** Seams 1 and 2 are unaffected and are still the place to
start. Seam 3 becomes the window-plus-spacing partition above. Seam 4 is unblocked, because the
solver being shared does not require the storage to be shared: the host can keep `hp_cycles` and
the consumer its own intents, both calling the same solver. Two collections over one engine is a
legitimate end state, and it keeps the open one-ledger-or-two question off this critical path.
