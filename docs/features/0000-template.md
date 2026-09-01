# <Feature name>

- **Status:** Shipped | Behind a flag | Built, unreleased | Deprecated
- **Released in:** `prod/ios-<version>`, or `unreleased — main only`
- **Owner surfaces:** the repos that implement it
- **Last mapped:** YYYY-MM-DD

---

## What it does

Written for a person using the app, not an engineer. No file paths, no collection names.
This section is publishable to a help centre as-is.

Cover: what it does for them, where they find it, what happens after they act, and how they
turn it off or change it.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| Capture | `lib/...` | | |
| Storage | `users.<field>` / `<collection>` | | |
| Display | `lib/...` | | |
| Edit | `lib/...` | | |
| Ranking | `firebase/functions/matching/...` | | |
| Rules | `firebase/firestore.rules` | | |
| Analytics | event names | | |
| Admin | `admin/src/...` | | |

Fields this feature reads or writes, with a link into `../FIELD_REGISTRY.md`:

- `<field>` — what this feature does with it

---

## Visual state

**UI surfaces.** One row per visual surface this feature owns. A surface with neither a golden
nor a dated screenshot is a gap, not an omission.

| Surface | Golden | Screenshot | Last verified |
| --- | --- | --- | --- |
| `<screen or widget>` | `test/goldens/goldens/<name>.png` | or `docs/features/_media/<feature>/<surface>-YYYY-MM-DD.png` | YYYY-MM-DD |

**Architecture.** If this feature crosses a collection, a function boundary, a repo seam or the
matching pipeline, the diagram lives here as a fenced ```mermaid block, not as an image, and it
is updated in the same commit as the code.

---

## Change protocol

Before you touch it:

1. Read this map, and the registry rows for the fields listed above.
2. Note which surfaces your change touches, and which it *implies*.

After:

3. Update the rows you changed, in the same commit.
4. Update `../FIELD_REGISTRY.md` if a field's wiring changed.
5. Run the contract tests named below.
6. If the change alters outcomes for real people, write an ADR.

**Contract tests guarding this feature:** `test/contracts/<file>` — `<IDs>`

**Invariants:** `docs/INVARIANTS.md` §`<section>`

---

## Backward compatibility

The released build is the compatibility floor ([ADR-0003](../adr/0003-single-environment-backward-compatibility.md)).

- Is this feature present in the released iOS build? If not, the backend may serve it but no
  user reaches it.
- Does the change alter a document shape, a function response, or a security rule that the
  **released** client depends on?

---

## Cross-product

What the host platform and Pulse have, or will have, a stake in. Note it when you see it,
even when the integration is far off. The bridge between products is a designed integration,
never an ad-hoc read.

| Product | Stake | Status |
| --- | --- | --- |
| `novara-host` | | Not built / Designed / Live |
| `novara-pulse` | | |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `YYYY-MM-DD` — what changed, and the ADR if there is one
