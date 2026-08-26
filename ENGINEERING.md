# Novara Engineering Standard

How the Novara repos record what exists, what changed, and why. One standard across
five repos so an agent or an engineer can start in any of them and be oriented in
five minutes.

> **Canonical copy:** `novara/ENGINEERING.md`.
> **Mirrors:** `novara-matching/`, `novara-host/`, `novara-pulse/`, and
> `Novara-Brain/03-product/engineering/` — byte-identical, synced by
> `scripts/eng/mirror_engineering.sh`, drift-checked by `/cross-repo-check`.
> **To change it:** edit the canonical copy, run the mirror script, commit all repos.
> Never edit a mirror.
> **Readable version:** https://claude.ai/code/artifact/880d897e-8d30-4b32-9dce-53385e1f0b71
> — same content, for readers without a checkout. If it 404s, this file is authoritative.

---

## 0. Read this first

You are an agent or an engineer opening one of these repos. Read in this order and stop
when you have what you need.

1. **`CLAUDE.md`** in the repo you are in — the rules you must follow here. Non-optional.
2. **This file** — how work is recorded across all repos.
3. **`docs/ARCHITECTURE.md`** — only the section covering what you are touching.
4. **`docs/INVARIANTS.md`** — only if your files appear in the repo's Pre-Flight Checklist.
5. **`docs/adr/`** — the decisions, when you need to know *why* something is the way it is.
   Grep it before proposing a change to anything that looks arbitrary. It usually isn't.

Everything else is generated, transient, or domain-specific and will be pointed at from
one of the five above.

**The one habit that makes all of this work:** the session that makes a decision records
it *in that session*, before it ends. Not later, not from the diff. See §3.

---

## 1. The repo map

| Repo | Path | Owns | Stack |
| --- | --- | --- | --- |
| `novara` | `~/novara` | Consumer app, admin portal, marketing site, Cloud Functions, **and the deployed Firestore rules and indexes for every product on `novarasocial-dev`** | Flutter, Node, React |
| `novara-host` | `~/novara-host` | Host platform (`hp_*` namespace, `hosts` functions codebase). Cannot deploy rules, by design | React, Vite, TS |
| `novara-matching` | `~/novara-matching` | The event matching engine — sparks / pods / rank — and the Match Console | Python, JS |
| `novara-pulse` | `~/novara-pulse` | Pulse iOS app | Swift, SwiftUI |
| `novara-brain` | `~/novara-brain` | Business and product knowledge, skills, canonical strategy. **Not a code repo** — it takes no part in the CI, changelog, or ADR conventions below | Markdown |

### Ownership boundaries that are load-bearing

These exist because crossing them causes a real incident, not because of taste.

- **`novara` is the sole owner of `firebase/firestore.rules` and
  `firebase/firestore.indexes.json`** for the shared Firebase project. `novara-host`'s
  `firebase.json` deliberately has no `firestore` section. Rules for `hp_` collections
  arrive from `novara-host/docs/pending-rules.md` via Jacky and are applied here verbatim.
  See ADR-0001.
- **No consumer code reads or writes `hp_*` collections**, and no host code touches
  consumer collections. The consumer↔host bridge is a future, explicitly designed
  integration, never an ad-hoc read.
- **`MATCHING.md` is generated** from `Novara-Brain/03-product/matching/source/`. It is
  mirrored into `novara`, `novara-host`, and `novara-matching`. Never hand-edit any copy.
  Decisions go into `MATCHING_INBOX.md` in whichever checkout you are in; Cowork sweeps.

---

## 2. The documentation model

Every piece of writing in these repos is exactly one of these. If you are about to write
something and cannot say which row it is, see §11.

| Tier | Where | Mutability | Answers | Written by |
| --- | --- | --- | --- | --- |
| **Standard** | `ENGINEERING.md` | Mirrored; changes are rare | How we work | Human, deliberately |
| **Contract** | `CLAUDE.md` | Living, kept short | The rules an agent must obey *in this repo* | Human or agent, one line at a time |
| **Architecture** | `docs/ARCHITECTURE.md` | Living | How the parts connect *today* | Agent, on structural change |
| **Invariants** | `docs/INVARIANTS.md` + `test/contracts/` | **Append-only** | What must stay true, and the test that proves it | Agent, with the code |
| **Decisions** | `docs/adr/NNNN-*.md` | **Immutable once Accepted** | Why, and what we rejected | The session that decided |
| **History** | `CHANGELOG.md` | **Generated** — never hand-edit | What changed | CI, from commit messages |
| **Release state** | Git tags + `docs/RELEASE_AND_ROLLBACK.md` | Living | What users actually have | Human, at release time |
| **Feature** | `docs/features/<name>.md` | Living, updated with the code | What a feature does, and every surface it touches | Whoever changes the feature |
| **Field registry** | `docs/FIELD_REGISTRY.md` | Living, **enforced** | Every user field and where it is wired | Whoever adds a field |
| **Handbook** | `docs/features/HANDBOOK.md` | **Generated** — never hand-edit | The user-facing half of every feature, in one place | `scripts/eng/build_feature_handbook.py` |
| **Domain spec** | `MATCHING.md` | **Generated** — never hand-edit | The matching model itself | Cowork, from the inboxes |
| **In flight** | `docs/plans/`, `*_INBOX.md`, `DEFERRED.md` | Transient | What is mid-build or owed | Whoever is building |
| **Reference** | `docs/*_RULES.md`, `docs/audits/` | Dated snapshots | A narrow rule set or a point-in-time finding | Whoever investigated |

### The two rules that keep the tiers from collapsing into each other

**A generated file is never hand-edited.** `CHANGELOG.md` and `MATCHING.md` are outputs.
An edit to either is silently destroyed on the next regeneration, and in the meantime it
is a lie that looks authoritative.

**A living document cannot answer "why".** `ARCHITECTURE.md` describes the present. Edit
it enough times and it says only what is true today, with no record of what was traded
away to get here — and it can drift out of sync with the code while still reading as
authoritative. That is exactly how
`Unified_Matching_Algorithm_Handoff_2026-08-22.md` came to say the engine merge was
pending after it had shipped. Decisions go in ADRs, which are records of a moment and
therefore cannot drift.

---

## 3. Decisions

### The threshold

An **ADR** is required when a decision is *expensive to reverse*:

> Would undoing this require a migration, a redeploy of something users depend on, a
> re-run, or an apology?

**Yes → ADR.** A change to what a scoring rule optimizes for. A data shape another
component reads. An interface with callers. A security or access-control model. A policy
that produces different outcomes for real people. Choosing one implementation when two
were viable.

**No → not an ADR.** Variable names, file layout, formatting. Anything you could change
tomorrow with no migration. Anything with one obvious answer and no rejected alternative.

### How the existing systems fit together

You have four places decisions get written. They are not redundant once you assign each
one a job. Filing in the wrong one is how a decision gets lost.

| System | Keeps | Status |
| --- | --- | --- |
| **`docs/adr/NNNN-*.md`** | Expensive-to-reverse decisions, with the rejected alternatives | The record of *why*. Immutable. |
| **`docs/DECISION_LOG.md`** | Dependency choices, tooling picks, "don't re-investigate this" notes | Stays. Cheap decisions live here and never graduate. Expensive ones get an ADR and a one-line pointer here. |
| **`MATCHING_INBOX.md`** | Matching-model changes, swept into `MATCHING.md` | Stays, unchanged. It feeds the *spec*. If the change also clears the ADR threshold, write both and have the inbox block cite `Refs: ADR-NNNN`. |
| **`docs/INVARIANTS.md`** | What must stay true, plus the contract test enforcing it | Stays. This is the **enforcement** half of an ADR — see below. |

### The link that makes ADRs load-bearing

Most ADR practices die because nothing depends on them. Here, one does.

**Every ADR's "What now has to stay true" section must name the invariant and the contract
test that guards it.** If there is no test, the ADR says so explicitly and that is a known
gap, filed in `DEFERRED.md`.

This is the difference between a decision that was recorded and a decision that is
*enforced*. The `girls.csv` baseline — 153 people, 305 edges, 41/41 seekers covered — is
not a nice fact in a document. It is an assertion in `novara-matching/tests/` that fails
the build when someone's refactor quietly changes who gets matched with whom.

### The immutability rule

**You never edit an Accepted ADR.** If the decision changes, write a new ADR and mark the
old one `Superseded by ADR-NNNN`. The old text stays exactly as written, wrong and all.

An edited decision record eventually describes only the present, which is what
`ARCHITECTURE.md` is already for. The value of an ADR is entirely in its being a fixed
point.

### Who writes them, and when

**The session that makes the decision writes the ADR, in that session.**

This is genuinely different here than at most companies, and it is worth being explicit
about because it is an advantage rather than a chore. At most companies ADRs die: someone
is asked weeks later to document a decision they half-remember, reconstructing intent from
a diff. It is lossy, it is tedious, and the practice lapses.

Here, an agent is present *while the reasoning happens*. It holds the alternatives that
were considered, the constraint that killed two of them, and the thing that was traded
away — none of which survive in the code. Writing the record at that moment is
transcription. Writing it later is reconstruction, and reconstruction is where drift
comes from.

The protocol:

1. A decision is made in a session.
2. **Before that session ends**, the ADR is written, status `Accepted`, with the rejected
   alternatives and the reason each lost.
3. The commit implementing it carries `Refs: ADR-NNNN` in its footer.
4. The invariant it creates goes into `docs/INVARIANTS.md` with its contract test.

**Do not generate ADRs from diffs.** An agent reading a commit after the fact is guessing
at intent, and a confident guess is worse than a blank page — it is the same drift,
produced faster and wearing a badge of authority. If the reasoning was not captured live,
say so in the Context section and name where it came from. An ADR that admits it was
sourced from a handoff doc is useful; one that invents a narrative is poison.

### Numbering

Sequential, zero-padded, per-repo, never reused: `0001-…`, `0002-…`. Gaps are fine;
collisions are not. If two land at once, whoever merges second bumps.

ADRs are **per-repo**, not central. A decision about matching scoring belongs next to the
matching code. A decision that genuinely spans repos — the rules-ownership boundary, for
instance — lives in the repo that owns the thing being decided, and the other repos'
`CLAUDE.md` points at it.

---

## 4. Invariants and contract tests

`docs/INVARIANTS.md` states what must stay true. `test/contracts/` (or
`NovaraPulseTests/ContractTests/`, or `tests/` in matching) proves it still is. Both are
**append-only** — feature work may add, but must never delete or weaken.

### Source scans are not property tests

Roughly 61% of `novara`'s contract tests are **source scans** — measured 2026-08-25,
about 108 of 175, with four files entirely scan-based. A source scan asserts a *spelling*,
not a property, and it matches wherever that spelling appears, including comments and
docstrings the author never aimed it at.

**So when you write or change one:**

> Plant the bug it is afraid of. Run it. Confirm it fails. Revert.

One in eleven audited on 2026-08-25 did not survive that. Narrow the scan to the region
where the property actually lives, and strip comments before matching.

This generalizes to any check you write anywhere, including the scripts in `/ship` and
`/cross-repo-check`:

> **Construct every check so the wrong hypothesis produces a different result.** A check
> that returns the same thing whether or not the problem exists is not coverage — it is
> worse than nothing, because it gets read as coverage.

The canonical example: `git log @{u}..HEAD 2>/dev/null | wc -l` prints `0` when there is
no upstream at all, which is indistinguishable from "nothing to push". That exact line
reported a repo as clean while it held seven commits and an empty remote.

---

## 5. Commits and the changelog

### Conventional Commits

Every commit message starts with a type. This is not ceremony: `CHANGELOG.md`, the GitHub
release notes, and the Notion Build Log that your agents read are all generated from these
strings. A commit of `update stuff` becomes a Build Log row that says `update stuff`, and
an agent reading it next month learns nothing.

```
<type>(<scope>): <imperative summary, no trailing period>

<body — the why, not the what>

<footer — BREAKING CHANGE: …, Refs: ADR-0003, Fixes #123>
```

| Type | For |
| --- | --- |
| `feat` | A new capability |
| `fix` | A bug fix |
| `perf` | Faster, no behavior change |
| `refactor` | Restructuring, no behavior change |
| `test` | Tests only |
| `docs` | Documentation only |
| `build` | Build system, dependencies, packaging |
| `ci` | CI configuration |
| `chore` | No production impact |

**Scope** is the component. Per repo:

- `novara` — `feed`, `activities`, `profile`, `onboarding`, `auth`, `filters`, `friends`, `functions`, `rules`, `admin`, `marketing`
- `novara-matching` — `rank`, `sparks`, `pods`, `console`, `profile`, `fixtures`
- `novara-host` — `events`, `tasks`, `guests`, `crm`, `rules`, `functions`
- `novara-pulse` — `trends`, `onboarding`, `theme`, `services`

**Breaking changes** get a `BREAKING CHANGE:` footer or `!` after the type —
`feat(rank)!: …`. This is the single most important one to get right, because it is what
flags a release as incompatible.

Real examples:

```
feat(rank): add uncovered_seeker_penalty to the objective

Seekers left unmatched previously cost nothing, so the solver stranded
the long tail. Penalty applies per uncovered seeker at weight 0.4.

Refs: ADR-0004
```

```
fix(pods): guard wave-merge against short waves

The A/B swap indexed past the end when a wave had fewer than two
members, which fires exactly on a T-1 re-run and sends guests to the
wrong signs.
```

**If you forget:** amend before pushing. After pushing to `main`, leave it — do not
rewrite shared history over a commit message. Write the next one correctly.

### The changelog is generated

`CHANGELOG.md` is produced by `git-cliff` from the commit messages, in CI, on every push
to `main`. **Never edit it by hand** — your edit is destroyed on the next push.

It records *what* changed. An ADR records *why*. Neither substitutes for the other.

---

## 6. Branches, PRs, and merge

- **New session → new branch from `main`, in a worktree.** Several agent sessions run
  against these repos at once and a shared checkout gives them one `HEAD` between them.
- **Check `git branch --show-current` before your first write.** On 2026-08-25 a session
  committed onto another session's branch, then reported it had pushed — having verified
  with `git log origin/main..main`, a command that compares `main` to `main` and says
  nothing at all about a commit on a different branch. Worktrees are the fix; this check
  is the cheap backstop when you are not in one.
- **Commit often** on the branch. **Never push, PR, or merge until Jacky says to.**
- **When ready:** `/ship` (or `/ship --fast` for hotfixes).
- **`main` is everything.** All work lands here. It is not "what's live" — it is what
  ships *next*. See §7.
- **PR titles follow §5.** The PR body is where the reasoning goes, and it is the cheapest
  durable place to put it. If the reasoning is expensive-to-reverse, it belongs in an ADR
  and the PR body links to it.

---

## 7. Releases and rollback

> **Reverting the app does not revert the backend.**

Novara has independently-deployed surfaces on one Firebase project, and they are not at
the same commit. `git checkout` restores source; only a redeploy changes what runs.

- **`prod/*` tags are what's live.** A tag, not a branch, because a rollback point must
  not move. `prod/ios-1.0.1+40` marks `43749af`, live since 2026-04-02.
- **Tag every App Store build and every web prod deploy, at release time.** This is the
  whole discipline. Without it, "what do users have?" requires archaeology, which is not
  a question you want to be researching mid-incident.
- **Never create a standing `production` branch.** See ADR-0002.
- **The gap between `main` and `prod/` is the plan, not drift.** Novara ships as one
  batched App Store release. It is also the hazard: backend deploys from `main` are
  exercised against the *released* build, not against `main`.

Read `docs/RELEASE_AND_ROLLBACK.md` before any rollback. The backend half is a redeploy,
not a checkout.

---

## 8. The required gate

Match verification cost to the change, but the gate below runs on **every** change,
UI included, and is sufficient on its own. Simulators and manual walkthroughs are not
part of routine verification.

| Repo | The gate | CI |
| --- | --- | --- |
| `novara` | `dart analyze` clean + relevant `test/contracts/` + (Functions) `npm test` and `npm run lint` in `firebase/functions` | `.github/workflows/ci.yml` |
| `novara-matching` | `python3 -m pytest tests/ -q` + `python3 tools/drift_check.py` exits clean | `.github/workflows/ci.yml` (added 2026-08-26) |
| `novara-host` | `npx tsc --noEmit` + `npm run build` | `.github/workflows/ci.yml` (added 2026-08-26) |
| `novara-pulse` | Build + `ContractTests` | `.github/workflows/ci.yml` |

**Run the full suite, not just contracts**, when you change a schema record, a widget's
public getters or constructor, or a shared test helper. Contract tests are source scans
and will not catch a widget that now crashes at runtime — a mocktail mock returning null
for a newly-added computed getter blows up every widget that renders it, and no scan sees
that. `/ship` runs the full suite before merge regardless.

---

## 9. Freshness

**A rule about the state of tooling gets a date. A rule about the system does not.**

Tag it `(world-rule, YYYY-MM)`. A dated rule is one you are allowed — expected — to
re-check and delete when its reason stops holding.

Undated rules do not merely go stale, they get *promoted*: "a workaround for a bug in
July" silently becomes "how we do things", because nothing recorded what would let you
demote it. If you find a world-rule whose reason no longer holds, **delete it**. That is
the entire point of the tag.

The same applies to any doc that states a measurement or a state of the world. Date it
inline: "roughly 61% are source scans (measured 2026-08-25)". A number without a date is
a claim with no expiry, and it will be repeated as current five years from now.

---

## 10. The Build Log

One Notion database, written by CI on every push to `main` in every code repo, never
hand-edited.

It exists for the readers that cannot clone a repo — Cowork, claude.ai sessions, and any
cross-repo question of the form "what has moved anywhere in the last two weeks". Git holds
everything an agent must *obey*; Notion holds the stream an agent might want to *scan*.

- Written by `scripts/eng/post_build_log_to_notion.py` from
  `.github/workflows/build-log.yml`.
- **It never fails a build.** Missing secrets, a Notion outage, a malformed commit — all
  print a warning and exit 0. Bookkeeping does not block a merge.
- Commits that do not follow §5 are **skipped and listed**, never guessed at. In the first
  weeks that skip-list is the useful signal: it tells you which habits have not formed.

### Adoption status

| Repo | Conventional commits | `CHANGELOG.md` | ADRs | CI gate | Build Log |
| --- | --- | --- | --- | --- | --- |
| `novara` | Adopting | Wired | 2 written | Yes | Wired |
| `novara-matching` | Adopting | Pending | Scaffolded | Yes (new) | Pending |
| `novara-host` | Adopting | Pending | Scaffolded | Yes (new) | Pending |
| `novara-pulse` | Adopting | Pending | Scaffolded | Yes | Pending |
| `novara-brain` | N/A — not a code repo | N/A | N/A | N/A | N/A |

**This table is hand-maintained, so it goes stale in exactly the direction that flatters:**
things get wired and it still says Pending. `/cross-repo-check` §10 verifies every cell
against the filesystem rather than trusting the row. Correct it there — it is a living
document and may be edited in place.

Roll the remaining **Pending** items out one repo at a time, and only after the previous
one has earned its keep. `CHANGELOG.md` and the Build Log are the same four files each
time; only `REPO_NAME` in the workflow and `tag_pattern` in `cliff.toml` change.

---

## 11. Feature documentation

`docs/features/<name>.md`. One file per feature, two audiences, because two documents about
one feature drift apart and the doc you read *before* a change must be the same doc that
explains the feature to a new hire.

```
## What it does        the user-facing description. Publishable as-is.
## Surface map         every place this feature touches
## Change protocol     what to check when you touch it
## Backward compat.    what the released build depends on
## Cross-product       what host / Pulse have or will have a stake in
## History             dated one-liners, append-only
```

### The rule

> **Read the feature doc before you change the feature. Update it in the same commit.**

Not afterwards, and not "when the feature settles". The value is that the next session
reads an accurate map, and a map updated later was wrong for however long that took. If
your change touches a surface the doc does not list, **add the row** — that is the doc
finding a gap in itself, which is what it is for.

### Why a feature is not one screen

Adding a field in onboarding means it must also be editable, displayed, possibly weighted
in matching, and possibly meaningful to the host platform or Pulse. Miss one and you get a
field the user gave you and cannot change, or one that silently stops feeding the algorithm
it was collected for.

This is not hypothetical. `group_preference` is collected from every user at signup, read
only by the admin portal, and invisible to the product. `neighborhoods` drives search,
groups and My Week, and the user has no way to set it. Both were found by the first
mechanical audit, on 2026-08-26.

### Two mechanisms, two jobs

| | Catches | Enforced by |
| --- | --- | --- |
| `docs/FIELD_REGISTRY.md` | A **data element** that is half-wired | A contract test. Adding a field to `UsersRecord` fails the build until it is registered. |
| `docs/features/*.md` | A **behavior** whose dependents you did not know about | `/ship`'s doc step, and the read-before-change rule. |

A registry row tells you `pace_range` feeds the pace gate. A feature doc tells you what
happens to Pace Match if you change how the gate works. You need both.

The registry is enforced only for *presence*, not for correctness of its cells. A check
claiming to verify wiring correctness would be lying; a human fills the cells, and the test
guarantees the field enters the conversation at all.

### Where the user-facing half is published

Authored in the repo that owns the feature, next to the code. `HANDBOOK.md` is generated
from those files by `scripts/eng/build_feature_handbook.py`, and is the readable,
shareable, cross-product copy.

**It is never authored separately, and never copied into Novara-Brain.** Brain holds
business truth: positioning, strategy, people. A feature description is product truth, and
duplicating it there creates exactly the drift Brain's own filing rules exist to prevent —
*one canonical home per concept, not two competing ones*. Brain, host and Pulse read the
handbook; they do not keep a copy.

CI runs `build_feature_handbook.py --check`, so an edited feature doc with a stale handbook
fails the PR rather than being discovered months later.

### When a feature needs a doc

**Yes** if a user can see it, or if more than one surface reads the same data to produce
it. **No** for a component with one caller, a styling change, or anything wholly inside one
widget — `docs/ARCHITECTURE.md` covers those.

---

## 12. Skills, routines and the brain

Process only survives if something runs it. These are the moving parts.

### Slash-command skills

| Skill | When | Repos |
| --- | --- | --- |
| `/ship` | Work is complete and Jacky has said to push. Analyse, test, review, PR, CI, merge, cleanup. `--fast` skips review. | `novara`, `novara-pulse` |
| `/build-ui` | Before building any UI component or screen. Reuse audit, token mapping, visual verification. | `novara`, `novara-pulse` |
| `/add-feature` | Starting any new feature. Analytics and testing checklist. | `novara`, `novara-pulse` |
| `/deploy`, `/deploy-web-prod`, `/deploy-web-test` | Deploying to any target. | `novara` |
| `/build-ios`, `/build-android` | Store builds. Auto-bumps the build number. | `novara`, `novara-pulse` |
| `/clean-dev` | Reclaiming disk, clearing orphaned simulator and Flutter processes. | `novara`, `novara-pulse` |
| `/cross-repo-check` | Read-only sweep of every repo for unlanded work and drift. | user-level, all repos |

### Scheduled routines

| Task | Cadence | Does |
| --- | --- | --- |
| `dev-cleanup` | Mon/Wed/Fri 09:00 | Xcode and simulator caches, build artifacts, stale branches and worktrees |
| `dep-check` | Mon 09:04 | Dependency sweep across all four code repos |
| `weekly-repo-sweep` | Fri 15:30 | Runs `/cross-repo-check` before Jacky's 16:30 retro |
| `nightly-brain-sync` | Daily 23:00 | Commits and pushes Novara-Brain, which Cowork cannot push itself |

`weekly-repo-sweep` exists because `/cross-repo-check` was manual-only, and a drift check
nobody remembers to run is a drift check that does not exist. It lands an hour before the
Friday retro on purpose: what it finds becomes retro input rather than a separate errand.

### Novara-Brain's relationship to the code repos

Brain is **not a code repo** and takes no part in CI, changelogs, ADRs, or the gate. It
holds one `ENGINEERING.md` mirror so brain and Cowork sessions see the same conventions.

The boundary runs in both directions:

- **Code repos never store business truth.** Positioning, competitor state, traction
  numbers and people live in Brain. A number pasted into a code doc goes stale silently.
- **Brain never stores product truth.** How a feature works lives in `docs/features/`, and
  Brain reads the generated handbook rather than keeping a copy.

The one channel that crosses deliberately is matching: `MATCHING.md` is generated from
`Novara-Brain/03-product/matching/source/` and mirrored into three code repos, with
decisions flowing back through `MATCHING_INBOX.md`. That is a designed pipeline with a
drift check, not an exception.

---

## 13. When you do not know where it goes

Ask, in order. Stop at the first yes.

1. **Is it a rule an agent must obey in one repo?** → `CLAUDE.md`, one line.
2. **Is it a decision that would be expensive to reverse?** → an ADR, now, this session.
3. **Is it something that must never stop being true?** → `docs/INVARIANTS.md` plus the
   contract test that proves it.
4. **Is it what a feature does, or a surface it touches?** → `docs/features/<name>.md`, in
   the same commit as the code.
5. **Is it a new field on a user?** → `docs/FIELD_REGISTRY.md`. The build fails until it is
   there.
6. **Is it how the pieces connect today?** → `docs/ARCHITECTURE.md`.
7. **Is it a dependency or tooling pick, so nobody re-investigates it?** →
   `docs/DECISION_LOG.md`.
8. **Is it a matching-model change?** → `MATCHING_INBOX.md`, in the same commit as the
   code.
9. **Is it owed to another repo?** → the handoff file that repo reads
   (`novara-host/docs/pending-rules.md`), plus tell Jacky.
10. **Is it in flight and will be obsolete when it lands?** → `docs/plans/` or
    `DEFERRED.md`.
11. **Is it business truth rather than product truth?** → Novara-Brain, never a code repo.
12. **None of the above** → it is probably a commit message. Write a good one.

If it still fits nowhere, that is a signal this standard has a gap. Say so rather than
inventing a thirteenth location.
