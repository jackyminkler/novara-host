# Recurring event cycles (product brief)

## Core functionality: availability solver & overlapping calendars

**For:** an incoming engineer, as a first build in the codebase
**From:** Jacky, product. **Date:** 2026-09-01. **Status:** open to a counter-proposal
**Readable version:** https://claude.ai/code/artifact/bf9c24ab-5e70-437d-b932-697aca7a1b84

**Related docs:**

- `CLAUDE.md` at the repo root is short and carries the hard rules.
- `docs/Recurring_Event_Cycles_Flow_v1.md` has the entity model and a deeper code map.
- `npm install`, run with `VITE_DATA_MODE=mock`. The whole host app runs in memory with fictional
  partners and no backend. Click through creating an event from a template, proposing dates,
  adding a partner, and the group scheduling flow. 20 minutes, worth more than this document.
- `src/data/api.ts`. Every piece of data goes through this seam, mock and Firebase behind it.
  Components never import Firestore directly.
- `docs/novara-hosts-wireframes-v2.html` in a browser. Every screen maps to a feature number - you
  can use as inspiration or build something new.

---

## 1. Context

**Host platform:** this repo. Web, desktop. Someone who runs community events plans and runs one
here: partners, tasks, a run of show, a recap. The host has an account; co-hosts, sponsors,
vendors and crew take part through a tokenised link as a guest.

**Consumer app:** Flutter, mobile, separate repo. 3 main parts - Push/Pull/Connect. This
functionality will align mostly with the Push functionality. A user keeps a standing wish to see
someone at a cadence, and the solver is what turns that wish into a real date.

**The consumer journey, if you look at the shared solver first:**

1. A member says they want to see a specific friend, or a few of them, about once a week or every
   few weeks. A range, not a recurrence rule. It is private, and the friend is never told the
   intention exists.
2. Both people's free windows are already derived on their own devices from their own calendars
   and stored as windows, never events. Same privacy shape as the host side.
3. The solver takes those windows, the cadence range, and how long it has been since they last
   saw each other, and looks for times that work for both.
4. When one does, the member gets a pre-filled plan, a time and a place ready to send. Not a
   reminder and not a nudge: no streaks, no "overdue", no day counts, and a cadence that slips is
   never shown as a failure.
5. They send it, and from there it is an ordinary plan. Any plan with that person satisfies the
   intention, so if they see each other anyway, nothing fires.

**It is the same call.** Host side: several sets of free windows, a window, a spacing rule, out
come ranked dates. Consumer side: two sets of free windows, a rolling window, a cadence range, out
comes one good time. Same inputs, same output, different surface and different vocabulary. That is
the case for a shared solver. Section 5 is the same point stated as an object model.

**On accounts, because the older docs overstate this.** Nothing today requires a partner to have
an account, and the guest link path has to stay complete without one: that is what makes the tool
work for a host whose partners have adopted nothing. Partner accounts are a real later capability
and a better platform, not something ruled out. Build so the no-account path is whole, not so
accounts are impossible.

**Shared architecture:** Currently there is nothing shared because the code bases are different.
I am considering building a shared service for this, so you can decide if you rather look into
that first for an architecture build or if you want to test out any UI builds.

`docs/adr/0001-one-solver-two-doors.md` is an open architecture question, summarised in the
appendix.

---

## 2. The problem

A host who runs the same event repeatedly, a monthly community run with a coffee shop partner
say, redoes the coordination from zero each time. The plan is not the expensive part, templates
cover that. **Agreeing the date with the partner, one event at a time, forever, is.**

Today the tool proposes a few dates for one event and collects a yes or no per date. It cannot
hold "we do this together every 4 to 6 weeks" as a thing that exists and turn it into dates.

**Why it is worth building.** The subscription argument to a recurring host is that the second
event costs a fraction of the first, and recurrence is where that compounding shows. Separately,
the consumer app needs the same object, section 5, so this is the first feature where one piece of
work plausibly serves both products.

---

## 3. The user story

> As a host who runs the same event with the same partner, I want to agree the next few dates with
> them in one exchange, so I can plan a quarter without a fresh negotiation each time.

---

## 4. The journeys

**The host**, on a desktop:

1. Picks an existing template, the reusable shape of the event, and says: repeat this.
2. Sets a **window**, the scope to search inside, October 1 to December 31 or the next 90 days.
   And a **spacing rule** inside it: target every 4 to 6 weeks, stretch to 3 or 7 if it has to,
   skip named blackout ranges such as a holiday week. Neither is optional, neither replaces the
   other.
3. Picks the partners, usually organisations already in the directory.
4. Sends one link. Not one per date, not one per event.
5. Sees which candidate dates work across everyone, ranked, with who can make each one.
6. Confirms the nearest date, which produces a **real event workspace**: its own page, the task
   skeleton on real dates, the run of show, the partner attached. This is the payoff, and it
   should use the event creation path that exists rather than a second one.
7. Leaves later dates flexible. They keep re-ranking as calendars change, confirmed one at a time.
8. Improves the plan while running October's event, saves it back to the template, and November
   starts from the better version.

**The partner**, on a phone, one link:

1. Taps it. No sign up, no download.
2. Connects a calendar, or marks days in and out by hand. The manual path has to be as good as the
   calendar path, because most partners will use it.
3. Answers once, for the whole window, inside the scope the host set. Can change it while open.
4. Later, sees the confirmed dates.

They never see the host's calendar, the host's events, event titles, or anything about other
partners. Openings and the dates in question, nothing else.

---

## 5. The same object on the consumer side

Three scheduling objects in the product, differing only in which field is empty:

| Object | Who | When | What |
|---|---|---|---|
| Open intent, consumer, unbuilt | **unresolved** | roughly known | known |
| **Cadence intent**, this brief | known | **unresolved** | known |
| Plan, both apps, built | known | known | known |

The host's repeating event with a co-host and a member's standing wish to run with a specific
friend about once a week are the same object: known party, known activity, unresolved date,
cadence as a range rather than a recurrence rule. Neither has shipped, so treating them as one
thing costs least right now.

---

## 6. Where the code already reaches

Treat this as a map, and **verify before relying on it**: the last handoff doc here had good
design and wrong assertions about the code. Verified on `main`, 2026-09-01.

| Piece | Where | State |
|---|---|---|
| Interval maths, free-window derivation from a calendar | `src/lib/availability/windows.ts`, `derive.ts`, `spread.ts` | Built, pure, no network or clock reads |
| Multi-party ranking, `coverage()` and `suggest()` | `src/lib/availability/coverage.ts` | Built, 24 tests. Ranks by how many can make it, then time of day, then soonest |
| Calendar ingest, Google and `.ics` | `googleEvents.ts`, `ics.ts` | Built. Parsed in the browser, never uploaded |
| Group scheduling with free time retained per participant | `Huddle` in `src/data/types.ts`, `src/guest/` | Built. `HuddleParticipant.free` holds intervals, never events |
| Guest links with a scope, one not tied to an event | `hp_guestTokens`, `booking` scope | Built. The precedent for a differently scoped link exists |
| Template to real event, task skeleton on real dates | `src/host/pages/NewEventPage.tsx`, `src/lib/dates.ts` | Built |
| Writing an event to a Google Calendar | `src/host/googleWrite.ts` | Built, one caller |

114 unit tests across `src/lib/availability/`. The ranking core is roughly 700 lines.

**Two dead ends**, both already recorded as owed in `docs/Availability_Feature_Plan_v1.md` §3,
which is the best evidence this feature is mostly joining rather than inventing:

1. **A group agreeing on a time does not produce an event.** The picked time is recorded and
   rendered, and nothing turns it into an event workspace.
2. **A partner's answer is per-date only.** `Party.dateResponses` stores yes or no per date, not
   free time, so ranking cannot run across host plus partners even though it is built to and the
   group path already feeds it that way.

---

## 7. What done looks like

A host sets up a repeating event with a partner once, sends one link, and gets real dates and a
working event workspace out of it, with later dates staying flexible.

Roughly four joins get there. This order is my guess, and it is the part I am least attached to.

| Join | What it does | Notes |
|---|---|---|
| 1. A settled group answer becomes an event | Closes the loop that dead-ends today | Smallest. Nothing new stored, nothing needed from me |
| 2. Partner free time retained, not just per-date answers | The joint the feature turns on | The group path already does this |
| 3. Cadence: several dates across a window | Partition a window under a spacing rule, rank inside each | Real design latitude |
| 4. The repeating-event object and its screen | The container, its link scope, the host surface | Largest. New stored data means a rules change from me |

**Recommendation, not an instruction:** start at join 1. Small, closes something that goes
nowhere today, teaches the data model by making you traverse it, depends on nothing from me. Then
join 2, where the feature starts working.

**Before joins 3 and 4** I want your sequencing proposal and your read on whether the model in
section 4 is the right shape. If you want to reorder the whole thing, say so.

---

## 8. Open product questions

1. **When nothing works.** No date suits everyone. Silent, or an explicit "no Saturday in November
   works for both of you, here is the closest"?
2. **Link scope.** One link across a quarter is convenient, and it shows the partner the shape of
   the host's calendar across a quarter. This could be a new entity before an event plan is
   decided on.
3. **Template drift.** If the template improves in November, does December follow the new version
   or the one it was set up under? Save updates to templates can be optional.
4. **Partner exit.** What happens to pending dates if a partner drops out mid-window.

---

## Appendix: the shared architecture question. Context, not the assignment

Every join in section 7 is buildable without touching this, and I would rather have your opinion
on it than your implementation of it.

The ranking core is roughly 700 lines of pure TypeScript with no framework, network or clock
dependencies, living here and imported directly by the host web app. The consumer app needs the
same logic and is Dart, so it cannot import a TypeScript file. Options: port it and keep two
implementations in step, put it behind a service both apps call, publish it as a package with an
HTTP door for the caller that cannot compile it, or leave it host-only.
`docs/adr/0001-one-solver-two-doors.md` writes up one of them; its status is Proposed, it is a
strawman written to be argued with, and **nobody should implement it, including you, until it is
settled.**

The three constraints that make it non-obvious. The ADR has the rest:

1. **The defect history.** 19 then 11 real defects behind 99 passing tests, the subtle ones all in
   the judgment layer: travel inference, evening rules, buffer padding. Exactly what a port gets
   wrong quietly.
2. **The privacy boundary has to get stricter, not looser.** The obvious service takes calendars
   and returns slots, and that is the one shape this cannot be. Ingest and derivation stay on the
   device; only intervals and constraints cross the wire.
3. **Ownership is unresolved.** Shared code belongs to neither repo's rules, and the last time a
   third repo joined a deploy handoff it stranded changes off `main` twice in one day.

Weigh in, or build first and form a view later. Joins 1 and 2 are unaffected either way.
