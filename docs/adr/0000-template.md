# ADR-NNNN: <short imperative title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** who actually made the call
- **Implemented by:** `<commit sha>` — fill in when the code lands, or leave blank
- **Context sourced:** live in the deciding session | transcribed from `<file>` | reconstructed (say so loudly)

---

## Context

What was true when this decision was made, and the forces in tension.

Be concrete and include the numbers — they are what make this readable in six months.
"41 seekers against 78 mentors" tells a future reader something. "An imbalance in the
roster" does not.

**State the constraint that actually forced the decision.** There usually is one, and it
is usually the first thing forgotten.

---

## Decision

What we are doing, in one or two sentences, present tense.

> We do X.

Not "we will consider" or "we might". An ADR records a decision that was made.

---

## Alternatives considered

The most valuable section, and the one that is unrecoverable later. Each rejected option
with the actual reason it lost.

**Option B — <name>**
What it was, and why not. "Slower" is not a reason. "Adds a second pass over the roster,
which pushes a 150-person run past the T-1 window" is.

**Option C — <name>**
Same.

If there genuinely were no alternatives, say so. That itself is worth knowing.

---

## Consequences

Both directions, honestly.

**What this makes easier**

**What this makes harder, or forecloses**

**What now has to stay true**
The invariant this creates, and the test that guards it:

- Invariant: `docs/INVARIANTS.md` §<section>
- Enforced by: `test/contracts/<file>` → `<test name>`
- If no test exists: say so, and file it in `DEFERRED.md`.

A future change that would break this needs its own ADR, even if it looks like a refactor.

---

## References

- Related ADRs
- The spec, handoff, or session this came out of
- The fixture or baseline that verifies it
