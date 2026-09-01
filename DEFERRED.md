# Deferred, novara-host

Work identified during the host platform build that is intentionally not being done yet. Each
entry: **what**, **why deferred**, and **where the seam is**, so picking it up later is a clean
addition rather than a rework.

This file is host-scoped. Cross-repo engineering-standard rollout items (architecture docs,
feature docs, CHANGELOG rollout, contract-test coverage) are tracked in `novara/DEFERRED.md`,
which covers all four repos.

Per `ENGINEERING.md`, every ADR's "What now has to stay true" section names the invariant and
the contract test that guards it. Where no test exists, the ADR says so and the gap is filed
here. An entry in this file is the record that an invariant is currently guarded by prose alone.

---

## Invariants declared but not yet guarded by a test

### The solver wire schema accepts intervals and constraints, and nothing else
- **What:** [ADR-0001](docs/adr/0001-one-solver-two-doors.md) states the invariant that raw
  calendar events never cross the wire. Today it is guarded by prose in the ADR and by the fact
  that no service exists yet. Nothing mechanical rejects a request field that is not an interval
  bound or a constraint.
- **Why it matters:** This is the ADR's sharpest claim and the one that sits against the patent's
  on-device language. It is also the boundary that gets crossed by accident rather than by
  decision: a caller adds a `title` for debugging, and the invariant is gone with nothing failing.
- **Why deferred:** ADR-0001 is **Proposed**, routed to an outside reviewer, and explicitly not
  open for a session to settle. The callable it describes does not exist, so there is no request
  schema to test. Writing the test first would pin a shape the reviewer may replace.
- **Seam:** When the callable lands, its request validator is the place. The test asserts
  rejection of any field outside the interval-and-constraint set, and it must run against the
  validator rather than against a type, since types vanish at runtime and this boundary is
  crossed by untyped JSON from a Dart client.
- **Assert the weekday form in the same test.** This repo indexes weekdays 0 = Sunday, off
  JavaScript's `Date.getDay()`. The consumer app indexes 0 = Monday, off Dart's
  `DateTime.weekday` minus one. Neither was chosen; the two language primitives disagree, and
  the consumer's form is now entrenched in stored documents and in the matching scorer, so it
  is not going to be unified. `weekdays` on `SuggestOptions` is a bare `number[]`, so an
  unconverted array across this boundary returns a plausible ranking for the wrong day with
  nothing thrown. The wire form must be named distinctly from the local one, and converted at
  the edge. See `docs/Availability_Feature_Plan_v1.md` section 4b, item 1.
- **Unblocks on:** the reviewer's recommendation landing and the ADR status flipping.

### One implementation of ranking, with no behaviour in the wrapper
- **What:** ADR-0001's second invariant. No test asserts that the service door and the direct
  import produce identical output.
- **Why deferred:** Same reason: there is one door today, so there is nothing to compare.
- **Seam:** ADR-0001's own Consequences section names it: one shared input builder, plus a test
  that runs one fixture through both doors and asserts identical output. Worth writing in the
  same change that adds the second door, not after.

---

## Host-repo gaps named elsewhere

### `ownerUid` isolation and the two-function guest model are guarded by prose
- **What:** This repo has rules tests (`tests/ownership.rules.test.ts`) but no `INVARIANTS.md`
  and no contract-test layer. The isolation model and the two-endpoint guest boundary are both
  invariant-shaped and currently described in `CLAUDE.md` alone.
- **Seam:** `novara`'s `INVARIANTS.md` plus its contract-test layer are the model. Noted in
  `novara/DEFERRED.md` under "Contract-test coverage is uneven across repos"; recorded here so
  the gap is visible from inside this repo too.
