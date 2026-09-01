# ADR-0001: One solver module, two doors

- **Status:** Proposed. **Open for a counter-proposal**, see Option G and the note at the end of
  Alternatives. This is a strawman written to be argued with, not a decision to implement.
- **Routed 2026-09-01:** Jacky is sending this to an engineer friend for an architecture opinion.
  Until that opinion lands and she flips the status, **no session should settle this, implement
  either option, or treat the chosen option as decided.** The five constraints at the end of this
  file are what to hand that reviewer, along with the options; not the conclusion.
- **Supersedes:** the no-service decision recorded in `docs/build-log.md`, for non-JavaScript callers only
- **Date:** 2026-09-01
- **Deciders:** Jacky
- **Implemented by:** _(blank)_
- **Context sourced:** live in the deciding session, 2026-09-01, building on a decision transcribed from `docs/build-log.md`

---

## Context

The availability solver lives in `src/lib/availability/`: five pure files, roughly 700 lines,
no firebase, react, clock or network imports. 73 unit tests across the module, 12 of them on
`coverage.ts` alone. It derives free windows from a calendar, ranks candidate slots across N
people by turnout then time of day then soonest, and returns one option per day.

An earlier decision, recorded in `docs/build-log.md` rather than here, ruled against putting it
behind a service. Its reasoning was sound and is worth restating: the feature is three parts with
different portability, and only derivation is worth sharing, and **a pure function is shared by
moving a file, not by adding a network hop.** It also cited a real cost: a service would have
added a third repo to a rules-deploy handoff that had already stranded changes off `main` twice
in one day.

**Three things changed.**

1. **The consumer app needs the same feature, and it is Flutter.** "Lifts into a package unchanged"
   is true between JavaScript codebases. A TypeScript module does not move into Dart by copying a
   file, so the premise the earlier decision rested on does not hold for this caller.
2. **The two features turned out to be one feature.** The host's recurring cycle with a cohost and
   the consumer's standing intention with a friend are the same object: known party, known
   activity, unresolved date, a cadence expressed as a range. Building them separately would fork
   a product concept, not just an implementation.
3. **Nothing is live.** Neither the host cycle nor the consumer standing intention has shipped, so
   the migration cost is zero today and rises the day either one does.

**The constraint that forces the decision:** this module has a defect history. Two adversarial
reviews found 19 and then 11 real defects behind 99 passing tests. A tool that confidently tells
five people they are free Thursday at 7 when one of them is not is trust-ending and silent. Two
implementations of that code, in two languages, drifting, is the single worst available outcome,
and it is the exact failure the `MATCHING.md` drift rule exists to prevent.

---

## Decision

> We keep one solver module and give it two doors. The pure TypeScript in
> `src/lib/availability/` stays the only implementation. JavaScript callers import it directly.
> A callable Function wraps that same module for callers that cannot. Ingest and derivation stay
> on the device; only free windows and constraints cross the wire.

**This supersedes the build-log decision for non-JavaScript callers.** That decision said no
service; we are building one. Its reasoning about ingest and about the surfaces still stands and
is not being overturned, but the headline is superseded and should be read that way rather than
as a continuation.

**The invariant that survives, stated as a rule rather than as deference to the old decision:**
there is exactly one copy of the ranking logic, and the service may not contain any behaviour the
local import does not. The moment a rule lives in the wrapper rather than the module, we have two
implementations again, and the wrapper is the easiest place for that to happen unnoticed.

**Where it lives.** The solver becomes a small versioned package, `@novara/solver`, in its own
repository: five pure files, roughly 700 lines, its tests, and nothing else. Both JavaScript
codebases take it as a pinned dependency. The callable that fronts it lives in the **consumer
repo's Functions codebase**, because the consumer is the app that can only reach the solver over
the wire and is the surface that will own scheduling long term.

**Why the asymmetry is by construction, not a compromise.** The unit of sharing is a package, not
a service. Any JavaScript caller compiles the package into itself and calls a function; Dart
cannot, so it calls the same package through an HTTP door. The host web app has no network hop
because the code is already in its bundle. The phone has one because it is not. Nothing about that
is a special case for the host: it is what "shared package" means, and a second caller in
JavaScript would behave the same way.

**The old objection to a third repo does not apply here.** The build-log warned against adding a
repo to the rules-deploy handoff. A package repo has no Firestore, no rules, no hosting target and
no deploy: it publishes a version. The thing it adds is a version bump, not a deploy.

**What this decision does not decide: where the data lives.** The solver being shared does not
require a shared collection. The host can keep `hp_cycles` and the consumer its own intents, both
calling the same solver with the same shapes. That keeps the open one-ledger-or-two question out
of this decision's critical path.

---

## Alternatives considered

**Option B — port the solver to Dart and keep the two in lockstep.**
This is what `MATCHING.md` permitted for `rank`, which is 281 lines of pure arithmetic pinned by
a golden fixture. The availability core is roughly 700 lines with a judgment layer in it: travel
inference, evening rules, early-departure handling, buffer padding. Its defect history says the
subtle failures are in exactly that judgment layer, which is the part a port gets wrong quietly.
Two copies of it would need a shared golden corpus to stay honest, and at that point the corpus
is the hard part and the port has bought nothing.

**Option C — a Cloud Run container, as `novara-matching` does for sparks and pods.**
Sparks and pods need a container because they are Python and pandas, and Node cannot run them
in-process. This module is TypeScript and Functions run Node 20, so there is nothing to
containerise. It would add a deploy target, an image to rebuild, and a third repo, for no gain
the callable does not already give.

**Option D — leave it host-only and let the consumer solve it later.**
Loses on timing rather than on architecture. Nothing is live, so this is the cheapest this change
will ever be. Deferring means the consumer builds a second scheduler against a shipped host one,
which is the fork we are trying to avoid, arriving later and more expensively.

**Option G — a shared service both apps call, on the `novara-matching` pattern. No package.**
**This option was missing from the first draft of this ADR and it is the strongest competitor.**
It was not considered fairly: Option C dismissed "a Cloud Run container" on the grounds that
TypeScript needs no container, which answers a different question. The real question is whether
*every* caller should go over the wire.

The case for it:

- **One pattern instead of two.** `novara-matching` already establishes engine-behind-a-service.
  A second, different pattern for a second engine means two mental models for the same idea. "All
  engines are services" is a rule a solo founder and a rotating cast of contractors can hold in
  their heads. "Engines are services unless they are TypeScript, in which case a package, except
  for non-JavaScript callers" is not.
- **Versioning is genuinely simpler.** Deploy once and both surfaces move together. With a
  package, publish then bump two pins, and between those bumps the two apps are provably running
  different ranking. That is a weaker version of the exact failure this decision exists to
  prevent, reintroduced in slow motion.
- **One place to pin, replay and diff.** The matching design rules require the scorer to be
  pinned, versioned, replayable and diffable. That is easier against one deployed version than
  against two dependency pins that can disagree.
- **One thing to operate.** One set of logs, one rollback.

The case against, and it is not decisive:

- Every ranking becomes a network call, including on the host page where it is currently free and
  instant.
- `VITE_DATA_MODE=mock` runs the whole host app with no backend, and that is how UI gets verified.
  A service breaks that unless the emulator is running or a local path is kept, and keeping a local
  path is the hybrid again by another name.
- A running cost per call where there is currently none.

**How the drift argument actually resolves.** The two apps ask different questions of the same
engine: the host ranks a host plus a cohost for an event, the phone ranks a user plus a friend for
an intent. The same question answered differently by the two apps is rare in practice, so
package-pin drift is a reasoning and testing cost rather than a correctness cliff. That weakens
the strongest argument for Option G without removing it.

**Status of this comparison: unresolved.** Option G and the chosen option are close enough that
this ADR should be read as a decision instrument rather than a decision, per `docs/adr/README.md`:
"write the options, sit with it, then flip the status."

**Option F — share the storage as well as the solver, one collection both apps read.**
Not rejected, deferred. It is a bigger decision than this one, it depends on the unresolved
one-ledger-or-two question, and nothing about sharing the solver requires it. Two collections
calling one engine is a legitimate end state, not only a stepping stone.

**Option E — move ingest into the service too, so clients send calendars rather than windows.**
Rejected on privacy, and it is the most important rejection here. The current design's best
property is that raw calendar data never reaches a server: an ICS is parsed in the browser and
discarded, huddle participants derive locally and send only intervals, and the guest function
never receives events. Sending calendars to a shared service would void that, and it sits badly
against the patent's on-device claims, which describe computing locally and transmitting only
abstracted parameters. The boundary drawn here is stricter than the one we have today, not looser:
the service only ever sees integers.

---

## Consequences

**What this makes easier**

- One ranking, one set of goldens, both surfaces changing together. A weight or tolerance changes
  in one place.
- The consumer gets cadence scheduling without a port, and the host keeps instant local ranking.
- It gives the pinned, versioned, replayable, diffable scorer a single home, which is what the
  matching design rules require of anything that ranks.
- The privacy boundary gets sharper: a service that only accepts intervals cannot leak an event
  title even by accident.

**What this makes harder, or forecloses**

- **A third thing to deploy, owned by neither repo.** Today there are two deploy targets, the
  host web app and the consumer app. This adds a solver Function that belongs to neither, and the
  host repo's own rules forbid it from touching the consumer's functions. Somebody has to decide
  which repo holds the file, which one deploys it, and what happens when both apps need a change
  at once. This is a governance problem rather than a technical one, and it is the one that bit
  before: changes stranded off `main` twice in one day.
- **One screen waits, and it is the phone's.** The host web app compiles the package into its
  bundle, so ranking happens in memory in microseconds and the dates are simply on screen. The
  Flutter app cannot compile a TypeScript package, so it calls the callable and waits, which means
  a pending state, a failed state, and no dates with no signal. One round trip on a screen opened
  occasionally, so the latency is minor. The real cost is a failure mode the host does not have,
  and it exists because of the language boundary, not because the two apps were treated
  differently.
- **Two ways in, one module, and the inputs can still drift.** Mock mode is how host UI gets
  verified with no backend, so the host must keep importing the module directly. The logic cannot
  fork, since it is one file. What can fork is input preparation: if one caller pads buffers before
  calling and the other does not, the same solver returns different answers and the solver gets
  blamed. Mitigated by one shared input builder plus a test that runs one fixture through both
  doors and asserts identical output.

**What now has to stay true**

- **Invariant: raw calendar events never cross the wire. The solver accepts intervals and
  constraints, and nothing else.** Not titles, not attendees, not locations.
- Enforced by: **no test exists yet.** File in `DEFERRED.md`. The test worth writing asserts the
  callable's request schema rejects any field that is not an interval bound or a constraint.
- Second invariant: one implementation, and no behaviour in the wrapper. Any Dart, Swift or
  Python re-implementation of ranking, or any ranking rule that lives in the callable rather than
  the module, needs its own ADR superseding this one.

---

## References

- `docs/build-log.md`, the entry beginning "It lives in this repo, not in `novara-matching`, and
  not in a new service" — the decision this one revisits, and the reasoning that still holds for
  ingest and for the surfaces.
- `docs/Recurring_Event_Cycles_Flow_v1.md` — the flow this serves.
- `MATCHING.md` §12, the drift rule, and the sparks/pods service precedent.
- `docs/Availability_Feature_Plan_v1.md` §3, for what is built and what is owed.


---

## Note on how this ADR should be used

This was written by working outward from an existing decision in `docs/build-log.md`, which is a
reasoning bias worth naming: the package answer preserves continuity with that decision, and
continuity is not by itself an argument. Option G was missing from the first draft for that reason.

The decision is close, the constraints are the hard-won part, and the person best placed to settle
it is whoever will operate it. What should be handed to an incoming engineer is the constraint set
below and the options above, not the conclusion.

**The constraints, which are not negotiable and are not obvious from reading the code:**

1. **One implementation of ranking, ever.** The `MATCHING.md` drift rule exists because two copies
   of correctness-critical logic diverge. This module found 19 real defects on one adversarial
   review and 11 on a second, behind 99 passing tests, and the subtle ones are in the judgment
   layer: travel inference, evening rules, buffers.
2. **Raw calendar data never crosses the wire.** ICS is parsed in the browser and discarded,
   participants derive free time locally, the guest function never receives events. Whatever is
   shared accepts intervals and constraints and nothing else.
3. **`VITE_DATA_MODE=mock` must keep working.** Running the whole host app with no backend is how
   UI gets verified in this repo.
4. **This repo never deploys Firestore rules.** New collections write a block to
   `docs/pending-rules.md` and stop.
5. **Whatever ranks must be pinned, versioned, replayable and diffable.** A change to ranking has
   to be answerable with "here is what would have changed, on last month's inputs."

**What to ask for back:** a recommendation with its rationale against those five constraints, in
this ADR's format, superseding this one if it lands somewhere else.
