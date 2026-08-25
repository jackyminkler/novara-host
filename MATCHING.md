# Novara Matching Engine

**Single source of truth.** Version 1.4.1, updated 2026-08-24.

Generated from `content.py`. The published artifact and this file render from the same
source, so they cannot disagree. When this document and the code disagree, the code wins
and this gets corrected.

> **Readable version:** https://claude.ai/code/artifact/6a055630-c583-4f58-94bf-ec5b4a69add5
>
> Mirrored in `novara`, `novara-host` and `Novara-Brain`. The artifact has Plain / Math / Code
> toggles per section; this file shows all three inline.

## Contents

- [00 Start here](#00-start-here)
- [01 One engine, many contexts](#01-one-engine-many-contexts)
- [02 Four ways something can matter](#02-four-ways-something-can-matter)
- [03 The dimensions](#03-the-dimensions)
- [04 Modes and selection](#04-modes-and-selection)
- [05 Missing data, and the floor that is not there](#05-missing-data-and-the-floor-that-is-not-there)
- [06 Direction, settled](#06-direction-settled)
- [07 What it optimizes for](#07-what-it-optimizes-for)
- [08 Status board](#08-status-board)
- [09 Decision log](#09-decision-log)
- [10 Traps](#10-traps)
- [11 Roadmap](#11-roadmap)
- [12 Where everything lives](#12-where-everything-lives)

---

## 00 Start here

This is the single source of truth for how Novara decides that two people, or a person and an activity, belong together. It covers the engine shipped in the consumer app, the two event formats run with Circe, and the roadmap that connects them.

It exists because the same algorithm had been rebuilt five times in three months, and the versions disagreed with each other in ways nobody noticed until they were read side by side.

### How to use it

- Every technical idea has three depths. **Plain** is the sentence you would say out loud. **Math** is the formula. **Code** is what actually runs. Switch depth per section, or set them all at once from the top.
- Point any AI at this document, in Cowork, Claude Code, or chat. The markdown mirror `MATCHING.md` sits in `novara`, `novara-host` and `Novara-Brain`.
- Section 08 is the status board: what is implemented, where, and how far along.
- Section 09 is the decision log. Settled decisions carry a date. Open ones carry the numbers you need to settle them.

> **The rule that keeps this honest**
>
> When this document and the code disagree, **the code wins and this gets corrected**. Anything here not yet true of the code is marked *planned* or *open*, never written in the present tense.

---

## 01 One engine, many contexts

Three problems look like three algorithms because they compare different shapes. A run intent against another run intent. A person against a fixed event. A person against a person on entirely unrelated dimensions.

They collapse into one as soon as every side of every match is expressed as a range rather than a point. A runner who wants 9:00 to 9:30 pace and an event that runs 9:00 to 10:00 are then the same kind of object. A person's intent is a candidate with narrow ranges. An event is one with wide ranges. A Circe attendee is one where place and time are simply unset, because the event already fixed them.

**Plain.** The engine takes two things and a context, and answers one question: how well do these two fit, given what this context cares about. It returns a number, the reason behind the number, and whether any rule was broken outright.

**Math.** score(A, B, config) → { total ∈ [0,1], breakdown, hardPass, trace } total = ( Σ_d ∈ D* w_d · s_d(A,B) ) / ( Σ_d ∈ D* w_d ) where D* is the set of dimensions for which both sides have data, s_d ∈ [0,1], and w_d comes from the context config. Weights need not sum to 1; the denominator handles it.

**Code.**
```
// novara/firebase/functions/matching/core.js
function score(profileA, profileB, modeConfig) {
  const weights = modeConfig.weights
  let weightedSum = 0, activeWeight = 0
  for (const dim of DIMENSIONS) {
    const d = dims[dim]                       // { score, hasData }
    const w = weights[dim] ?? 0
    if (d.hasData) {                          // only scored dimensions count
      breakdown[dim] = d.score
      weightedSum  += w * d.score
      activeWeight += w
    } else breakdown[dim] = null
  }
  const total = activeWeight > 0 ? weightedSum / activeWeight : 0
  return { total, breakdown, hardPass, trace }
}
```

> **Why the denominator matters more than it looks**
>
> Dividing by the weight that actually applied means a blank field neither helps nor hurts. A new user with three fields filled is scored on those three, not punished for the four they skipped. This is the fairest missing-data policy and it has a sharp edge, covered in section 05.

---

## 02 Four ways something can matter

Conflating these is the classic failure. Each one is a different mechanism, not a different number.

| Kind | Behaviour | Test for it | Example |
|---|---|---|---|
| **Required** | A gate. Cannot be outscored at any weight. | Would I still show this if everything else were perfect? If no, it is a gate. | Blocks, privacy, cohort, the event pace gate |
| **Weighted** | A preference. Counts proportionally. | More of it is better, but none of it is survivable. | Proximity, run type |
| **Modulated** | A multiplier the context applies to a weight. | The dimension matters more here than there. | Workout runs up-weight availability, down-weight proximity |
| **Irrelevant** | Weight zero, because the context already fixed it. | Is this already decided by the situation? | Place and time at a hosted event |

> **The trap**
>
> A gate expressed as a very large weight is still not a gate. Enough small wins elsewhere will outvote it. If something must never happen, it belongs in `hardDimensions`, not in the weight vector.

---

## 03 The dimensions

Every dimension is a pure function of two profiles returning a score between 0 and 1, or a flag saying it had nothing to work with. No dimension knows which context it is being used in.

### Shipped in the app

| Dimension | Weight (open pool) | Measures | Live? |
|---|---|---|---|
| `proximity` | 0.30 | Haversine miles, linear falloff to the tighter of the two radius caps | Yes |
| `pace` | 0.25 | Bucket adjacency, set to set | Yes |
| `availability` | 0.15 | Shared day and time slots over the smaller calendar | Yes, once onboarded |
| `runType` | 0.10 | Jaccard overlap of run types | Yes, once onboarded |
| `socialIntent` | 0.08 | Jaccard overlap of stated social intent | **No. Empty until a capture surface exists** |
| `goal` | 0.06 | Same goal or not | **No. Null until a capture surface exists** |
| `genderSoft` | 0.06 | Population lean when no preference is stated | Yes, for anyone who completed onboarding step 7 |

> **0.14 of the declared weight never participates**
>
> socialIntent and goal are structurally empty. Onboarding writes neither, and the schema itself says *null until a capture surface exists*. genderSoft does participate: onboarding step 7 captures gender and preference. Renormalization silently redistributes the empty 0.14, so for a fully onboarded pair the live weights sit nearer proximity 0.349 / pace 0.291 / availability 0.174 / runType 0.116 / genderSoft 0.070 than the published table. Not a bug, but nobody had written it down.

### Pace, in three depths

**Plain.** Your pace is a range, not a number. If two ranges overlap at all, that is a perfect fit. If they do not, the fit fades smoothly with the gap between them and reaches zero at 90 seconds a mile apart. No cliffs: 8:58 and 9:02 are four seconds apart and score almost perfectly, where the old band system put them in different bands and scored them worse than a 9:02 and a 9:58. Bands survive only as the fallback for data that was captured as bands, like the event form, where the finer signal never existed.

**Math.** For pace intervals [a_lo, a_hi], [b_lo, b_hi] in sec/mile: gap = max(0, max(a_lo, b_lo) − min(a_hi, b_hi)) s_pace = max(0, 1 − gap / τ), τ = 90 s/mile Overlap is a plateau at 1.0. Linear by choice: τ is arguable in a product review, a decay constant is not (Chen's exponential shape survives as the no-cliff principle; his constants were never fitted to anything). Symmetric, since gap does not depend on argument order. Fallback for bucket-only profiles: same bucket 1.0, adjacent 0.5, else 0.

**Code.**
```
// core.js (decision 2026-08-24; tolerance Firestore-tunable)
const gapSec = Math.max(0, Math.max(aLo, bLo) - Math.min(aHi, bHi))
const score  = Math.max(0, 1 - gapSec / tol)   // tol = 90 default
// overlap -> 1.0 plateau; beyond tol -> 0 -> hard-fails in open pool
// bucket-only profiles fall back to adjacency (1.0 / 0.5 / 0)
// test: 8:58 vs 9:02 (~0.96) must beat 9:02 vs 9:58 (~0.38)
```

### One pace range today; run types infer from it

The app stores exactly one pace range per person (decision 2026-08-24). Run types do not get their own pace question; they get inference rules on that single range: **long runs** track toward the slower end; **social runs** barely weight pace at all; **easy runs** sit middle-to-slow end, and usually at the shortest-to-middle end of someone's preferred distances; **track sessions** weight pace less but still prefer close, because a general pace is a usable proxy for interval pace and overall endurance. None of this touches the scorer: `GROUP_RUNTYPE_PROFILES` in `modes.js` already varies weights per run type (a workout run weights pace 0.15 against the open pool's 0.25), so these rules are per-runType weight and range-endpoint adjustments in config, not new code paths.

> **Two refinements deliberately deferred to the roadmap**
>
> **Overlap width.** The plateau treats a 2-second sliver of overlap and a fully nested range as the same 1.0. A wide-range runner (9 to 11) currently matches a 7:15 to 9:15 runner perfectly on a 13-minute overlap window they would share for about one street corner. The fix blends the gap score with the overlap fraction and lives entirely inside `scorePace` / `d_pace`; the scorer API does not change. **Conditional pace.** One range hides that the same person runs 8 to 9 for 3 to 5 miles and 10 to 11:30 for 6 to 13. The designed path keeps the scorer untouched and makes *feature extraction* context-aware: `paceIntervalFor(profile, distance)` instead of a stored constant. Both are section 11 roadmap rows.

### Event-side dimensions

These are scored today by the Sparks and Pods matchers, from a registration form rather than a stored profile. They are not a separate algorithm. They are the capture surface for `socialIntent` and `goal`, which the app declared, weighted, and left empty.

| Dimension | Measures | Maps to |
|---|---|---|
| `direction` | Mentor, Seeker, Both or Open, and the complementarity between two of them | socialIntent |
| `topic` | What A wants to learn against what B can share, both directions, IDF weighted | socialIntent |
| `industry` | Shared industry cluster from free text | goal |
| `dream` | Whether B resembles the person A said they wanted to meet | goal |

### Complementarity is not similarity

**Plain.** Most dimensions reward sameness. Two of them reward difference. Someone who wants to learn fundraising and someone who can teach it are a good match precisely because they are not the same. Averaging that away would destroy the signal.

**Math.** For asymmetric dimensions, score the two directions separately and keep both: f(A→B) = |learn(A) ∩ share(B)| / |learn(A)| f(B→A) = |learn(B) ∩ share(A)| / |learn(B)| s_topic = ½( f(A→B) + f(B→A) ) + bonus if both > τ Requires **both** directions to be known. One known direction averaged with an unknown fabricates confidence. Patent claim 18.

**Code.**
```
# sparks matcher, match.py
def topic_component(a, b):
    fab, hits_ab = fit(a, b)      # what a wants that b has
    fba, hits_ba = fit(b, a)      # what b wants that a has
    score = (fab + fba) / 2
    if fab > 0.3 and fba > 0.3:   # genuinely two-way beats one-way
        score = min(1.0, score + 0.2)
    return score, hits_ab, hits_ba   # <- both directions returned SEPARATELY
```

### Two terms used above, in plain language

- **Jaccard overlap**: what fraction of everything either of you mentioned do you share. Likes {easy, long, tempo} against {easy, tempo, track} shares 2 of 4 distinct types, 0.5. Ticking more boxes grows your denominator too, so nobody wins by spamming.
- **Haversine**: the distance between two map points measured on the curved Earth rather than flat paper. It turns two pins into miles apart, which becomes a score by linear falloff against the tighter of the two radius caps.

> **Store the directions separately or you will ship false statements**
>
> A pair score is directional; an edge is not. Storing one direction's metadata on both ends of an edge made 42 percent of guest-facing explanations describe the wrong person, in two independent implementations, on the same day. See section 10, trap 1.

---

## 04 Modes and selection

A mode is data, not a code path. It names the weights, which dimensions are gates, and how results get chosen. The scorer never branches on it.

### Selection: the part people skip

Scoring tells you how good a pair is. Selection decides who actually gets matched, and it is a genuinely different problem depending on whether a match consumes the people in it.

| Mode | Shape | Used by | Status |
|---|---|---|---|
| `rank_top_n` | One query, many reusable candidates. Sorting is correct. | App feed, club events | Shipped in the app |
| `global_assignment` | One to one, each match consumes both sides. Sorting is **not** correct; needs Hungarian. | Mentor pairing | In v1 spec, not in app |
| `b_matching` | Mutual edges, degree 3 to 5 per person. | Sparks | Shipped as a script, not in the app |
| `group_partition` | One set into groups of k. Optimize the **worst** group, not the average. | Pods | Script has two blockers |

**Plain.** If a match uses someone up, greedy picking strands people. Taking the best pair first, then the best of what remains, feels right and is provably wrong. On a real cohort it formed two pairs where the optimum formed four, leaving four people with nobody.

**Math.** Greedy on a matching problem is not optimal. Maximum-weight bipartite matching requires the Hungarian algorithm, O(n³). For groups, optimize min_g∈G quality(g) rather than mean, because one bad group is felt by everyone in it while a good average is felt by nobody.

**Code.**
```
# PLANNED, not shipped. These profile names belong to novara_match_v1, which is
# spec-only today. Selection is the profile's decision, never the caller's.
SELECTION = {
  'app_intent_v1'   : rank_top_n,
  'club_event_v1'   : rank_top_n,
  'mentorship_v1'   : global_assignment,   # Hungarian
  'circe_sparks_v1' : b_matching,          # mutual edges, capped degree
  'circe_pods_v1'   : group_partition,     # local search on worst-pod
}
```

### Mutual edges, and why Sparks works

**Plain.** If Ana is told to find Priya, Priya is told to find Ana. Both arrive expecting each other, which is what makes an introduction happen instead of one person approaching a stranger. It also structurally prevents the popularity problem.

**Math.** Build the match set as an undirected graph with a degree cap per node, rather than ranking each person's list independently. Independent ranking compounds popularity: in the June data 12 of 55 attendees appeared in nobody's list while the top 3 absorbed 26 percent of all slots. Directed bonus matching in the pod run left 44 of 153 invisible. Mutual edges with a cap left **zero**.

**Code.**
```
# three passes, match.py
# 1. reservation: every hard Seeker gets one mentor-side edge first,
#    spreading scarce mentors by raising the per-mentor limit 1 -> 2 -> 3
# 2. greedy fill: walk all pairs by score, accept if both sides under cap
# 3. top-up: anyone under the minimum, relaxing the gate then the cap
def take(sc, ga, gb, meta):
    chosen[ga][gb] = meta
    chosen[gb][ga] = flip(meta)   # mirrored, NOT the same object
    deg[ga] += 1; deg[gb] += 1
```

---

## 05 Missing data, and the floor that is not there

Unknown is a first-class state. It is never coerced to zero and never invented. A hard constraint with no data does not fail, because you cannot gate on a blank.

**Plain.** Renormalizing is the fair thing to do and it has one sharp edge. If two people share only one known field and it matches perfectly, they score 100 percent. A pair who match well on all seven scores 96. The thin pair wins, and it should not.

**Math.** total = Σw_ds_d / Σw_d over D* only. Let confidence c = Σ_d∈D* w_d / Σ_d∈D w_d, the share of the profile's weight backed by real data. Require c ≥ c_min (≈ 0.60) before a match is surfaced. Without it, argmax(total) systematically favours sparse profiles.

**Code.**
```
// core.js computes activeWeight and then DISCARDS it:
const total = activeWeight > 0 ? weightedSum / activeWeight : 0
return { total, breakdown, hardPass, trace }
//        ^ no confidence, no floor, nothing downstream checks it

// what it needs:
const confidence = activeWeight / totalWeight
return { total, confidence, breakdown, hardPass, trace }
// and in the profile: minConfidence: 0.60
```

> **Settled 2026-08-24: lower-bound ranking, not a hard floor**
>
> `score()` now returns `confidence` (the share of the mode's weight backed by real data) and the pipeline ranks by `lb = total − λ·(1 − confidence)`, λ = 0.5, batch mode 0, tunable from the Firestore `config/matching` doc without a redeploy. Thin matches still appear, they just cannot outrank fully-known good ones, so the feed never empties during cold start. A hard floor was considered and rejected for exactly that reason. Patched in the `novara` checkout alongside continuous pace, 10 new tests, 62 of 62 passing, awaiting Jacky's commit.

### The exploration slot, sequenced

Deliberately reserving a feed slot for a high-uncertainty match is the standard counterweight to lower-bound ranking. It is sequenced **behind the logging contract**, not rejected: exploration is a purchase, a probably-worse match today in exchange for learning whether it was actually good, and until outcomes are recorded the learning is never collected. At launch everyone is new, so the whole feed is already exploration.

---

## 06 Direction, settled

The event form asks what someone wants from the event. Three options, multi-select. How that answer becomes a direction was implemented two different ways, and the two disagreed about a quarter of the room.

| Ticks | Count of 154 approved rows | June rule | v3 rule | Settled |
|---|---|---|---|---|
| seek | 42 | Seeker | Seeker | **Seeker** |
| seek + general | 38 | Open | Seeker | **Seeker**, fallback_ok |
| general | 48 | Open | Open | **Open** |
| give | 5 | Mentor | Mentor | **Mentor** |
| give + general | 7 | Both | Mentor | **Mentor**, fallback_ok |
| seek + give | 3 | Both | Both | **Both** |
| seek + give + general | 11 | Both | Both | **Both**, fallback_ok |

The option reads *"I'm open to a general conversation if there's no specific match."* It was written as a companion to a specific request: a fallback when paired with one, and the whole ask when it stands alone. So it is not a direction at all. It is a statement about how much it costs to miss.

June's rule read it as a downgrade. The v3 rule ignored it. June's was also internally inconsistent: the same tick pushed a mentor toward Both and a seeker toward Open, in opposite directions, depending on what it sat next to.

> **Settled 2026-08-23**
>
> **Direction** comes from the mentor and seek ticks only. **fallback_ok** is a separate boolean from the general tick. The reservation pass orders hard seekers, then soft seekers, then Open. One definition, written here, imported by everything.

### What the shipped run delivered, seen through the settled rule

Counts here are 153 unique people, one fewer than the table above, because one registrant signed up twice under two email addresses and is merged. She ticked seek alone on one registration and seek plus general on the other, and the merge unions the answers, so the person removed comes out of the no-fallback row.

| Group | n | Got a mentor-side match |  |
|---|---|---|---|
| Seeker, no fallback | 41 | 41 | 100% |
| Seeker, fallback ok | 38 | 14 | 37% |
| Open | 48 | 14 | 29% |

Soft seekers came out barely ahead of Open, because the June rule filed them as Open. Nobody decided that. The settled rule places them in the middle deliberately.

---

## 07 What it optimizes for

A matching engine with no stated objective is a scoring script. The objective is what makes a weight arguable.

- **North star:** repeat verified attendance within 30 days.
- **Optimized today:** fit across the available dimensions, as a proxy, because almost no outcome data exists yet.
- **Explicitly not optimized:** clicks, session time, match volume, feed fill rate.

> **Anti-engagement, on purpose**
>
> Patent claim 21 targets predicted real-world attendance rather than engagement. Nothing in the engine optimizes a click. A match that produces a good conversation and no app usage is a success.

### Constraints that sit next to the objective

- Output is always a coordination object, a run, intent, event or slot. Never a bare list of people.
- Every surfaced match should ship a human-readable reason built only from data both sides supplied, and a match the system cannot explain should not be surfaced. **Not enforced in the app.** `synthesizeRun` writes a `whyMatched` object whose fields are all null, and no code path gates surfacing on explainability. The event matchers do enforce it. *Open.*
- Proposals such as "we suggest Saturday 7am" are synthesized **after** scoring, from the matched ranges. They never enter the score.

---

## 08 Status board

What exists, where it lives, and how far along it is. This is the section to update first when anything ships.

| Piece | Where | Stage | Notes |
|---|---|---|---|
| **App scoring core** | `novara/firebase/functions/matching/core.js` | **Shipped** | 7 dimensions, renormalized, hard gates, per-match trace |
| **App modes** | `matching/modes.js` | **Shipped** | openPool, group, batch, plus per-runType weight profiles |
| **Weight tuning** | `matching/config.js` | **Shipped** | Firestore `config/matching`, no redeploy. Remote Config path written but inert until firebase-admin v12 |
| **App pipeline** | `matching/pipeline.js`, `index.js` | **Shipped** | Eligibility, blocks, reports, daily generation, run synthesis |
| **App tests** | `__tests__/matching.test.js` | **Shipped** | 52 tests, including an exhaustive bidirectional-pace regression |
| **Lower-bound ranking + continuous pace** | `matching/core.js`, `pipeline.js`, `modes.js`, `config.js` | **Patched, awaiting commit** | confidence returned, lb ranking, continuous interval pace with 90s linear tolerance (bucket fallback), λ and τ Firestore-tunable. 62 of 62 tests pass on-device. Uncommitted in the checkout |
| **socialIntent capture** | app onboarding | **Not built** | Dimension is weighted 0.08 and always empty |
| **goal capture** | app onboarding | **Not built** | Dimension is weighted 0.06 and always null |
| **Event engine** | `novara-matching` repo (github.com/jackyminkler/novara-matching) | **Built 2026-08-24** | One CLI, profile JSON per context, formats sparks / pods / rank, 21 regression tests. Archive copies in the brain are superseded by this repo |
| **Sparks (b_matching)** | `novara-matching/formats/sparks/` | **Ran live + tested** | Ran Aug 21/22 on 153 people. Golden baseline now enforced by the test suite; columns profile-injected |
| **Pods (group_partition)** | `novara-matching/formats/pods/` | **Fixed** | Both blockers resolved 2026-08-24; identical 38-pod baseline on the Aug export; runs on Python 3.10 |
| **Rank (concierge)** | `novara-matching/formats/rank.py` | **Built** | Any spreadsheet in, top-N per person out. App dimension vocabulary, lower-bound ranking, parse-rate guard |
| **Match Console (browser)** | published artifact | **Built 2026-08-24** | Rank mode ported line-for-line to JavaScript: drop a CSV, tune weights and λ and τ, top-N per person with reasons, copy-out CSV. Runs entirely in the browser; the roster never leaves the page. Parity-verified against rank.py on 333 surfaced matches. Prototype for the host-app event-template feature |
| **novara_match_v1** | spec only | **Retired 2026-08-24** | Its architecture is implemented by the app engine and this repo; its spec informed both. The lost package is not worth recovering |
| **Host app integration** | `novara-host` | **Not started** | No matching anywhere in the repo. Pods and Sparks as templates is the target |
| **Chen's inherited repo** | `.../implementations/chen-inherited/` | **Superseded** | Neither pipeline runs. ~150 lines of scoring design salvaged |

### Evidence so far

| Signal | Value | Source |
|---|---|---|
| People matched | 153 into 305 mutual edges | Aug 21 export, Aug 22 event |
| Hard seekers given a mentor | 41 of 41 | Sparks run, re-scored under the settled rule |
| Matches beyond one pace band | 0 | Sparks run |
| Guest-facing lines audited | 610 of 610, zero false claims | Manual audit against the raw export |
| June to August retention | 9 of 55 registered again, 16% | Roster cross-reference |
| Conversion once on the list | June alumni 50% vs 31% overall, 1.6x | Roster cross-reference |
| Returners skew mentor-side | 40% vs 15% of first timers | Roster cross-reference |
| Verified attendance | **None. Nobody has ever checked in** | checked_in_at empty on all 501 rows |

> **The measurement gap**
>
> The north star is repeat verified attendance and there is no attendance data at all. Day-of check-in is the single cheapest instrumentation change available, and until it exists every number above is a registration metric wearing a retention costume.

---

## 09 Decision log

### Settled

| Date | Decision | Why |
|---|---|---|
| 2026-08-24 | Decisions made in code sessions land in `MATCHING_INBOX.md`, swept into this doc from Cowork | MATCHING.md is generated and must never be hand-edited; the inbox next to each mirror gives Claude Code a place to log decisions that provably flows back. Section 12, the update loop |
| 2026-08-24 | The Match Console mirrors `rank.py`; a change must land in both or be logged as a divergence | Two implementations of one rule set is the drift that section 10 exists to prevent. The console header pins the engine version it mirrors |
| 2026-08-24 | One stored pace range per person; run types infer from it. Long runs use the slower end, social runs barely weight pace, easy runs sit middle-to-slow at shorter distances, track prefers close as an endurance proxy | Per-runType inference is config on one honest number, not four more onboarding questions. Overlap-width and distance-conditional pace deferred to the roadmap with the architecture already shaped to take them. Section 03 |
| 2026-08-24 | Continuous interval pace with a 90 s/mile linear tolerance; bucket adjacency only as the fallback for band-only data | Bands put 8:58 and 9:02 in different bands (0.5) while scoring 9:02 vs 9:58 perfect (1.0). Chen's no-cliff shape adopted; his unfitted constants rejected; linear because a tolerance is arguable and a decay constant is opaque |
| 2026-08-24 | Lower-bound ranking, λ = 0.5, batch 0, Firestore-tunable. No hard floor | A floor empties the feed exactly at cold start; the lower bound fixes the thin-profile bug without excluding anyone. Section 05 |
| 2026-08-24 | Exploration slot sequenced behind the logging contract | Exploration buys data; without logging the data is never collected. Not rejected, sequenced |
| 2026-08-24 | Event engine lives in its own repo, `novara-matching` | Production-bound code gets its own history and tests; the brain keeps business memory. Succeeds Chen's repo of the same name |
| 2026-08-24 | `novara_match_v1` retired, not recovered | You build on the thing that is running. Its ideas survive in the app engine, this repo, and this document |
| 2026-08-23 | Spreadsheet rule: any recognized column is scored, any absent column drops out and weights renormalize | Same behaviour as the shipped app engine, so concierge sheets need no explanation |
| 2026-08-23 | Direction from mentor/seek ticks only; `fallback_ok` separate | The general option was designed as a fallback companion, not a direction. Section 06 |
| 2026-08-23 | One engine; event matchers are the capture surface for socialIntent and goal | They are not a parallel system. They fill dimensions the app declared and left empty |
| 2026-08-22 | Sparks pace gate stays hard at plus or minus one band | Zero violations shipped across 305 pairs. Two people who cannot run together cannot talk |
| 2026-08-22 | Brunch matches: pace gate off, professional fit only, separately labelled, mutual, higher floor | At an event with a sit-down afterwards the pace band only governs the first hour |
| 2026-08-22 | Bonus and spark edges are mutual, with a degree cap | Independent ranking compounds popularity. 44 of 153 were invisible under directed matching |
| 2026-08-21 | Gender dimension only from an explicit field. Never name inference | The v2 manual pass hit four ambiguous names |
| 2026-08-21 | Output is a coordination object, never a list of people | Canonical positioning guardrail |

### Open, with the numbers you need

| Decision | Options | What the data says |
|---|---|---|
| `uncovered_seeker_penalty` | 0.12 shipped, or 0.20 | 0.20 covered 72 of 78 vs 70, costing 0.008 mean pod affinity. The v3 doc recommends 0.20 |
| **Dedupe policy** | Union the answers, or keep most recent and flag | Sparks unions, v3 keeps most recent. Hybrid: union multi-selects, flag conflicting pace for a human |
| **Direction matrices per profile** | Keep the divergent values, or unify | Mentor+Both is 0.90 in Sparks and 0.40 in Pods. Both defensible; clustering mentors wastes anchors in a pod but is fine over brunch. Keep divergent, but as declared config |
| **Weight ordering for peer matching** | Backlog says place = runType > pace = distance = time; inherited model says pace = distance dominate | Both live under different profiles. Outcome data decides |
| **App tolerances** | pace ~90 s/mi, distance 5 km, time 90 min, near-miss ceiling 0.25 | All starting values, explicitly labelled as guesses |
| **Saturation** | Soft, always drop AI and IDF-weight the rest, or strict hard-drop above 40% | Strict zeroed three of six topics on a 153-person room. Soft above ~100 people |
| **Form redesign** | Split intent into two questions, or keep and parse | Splitting removes the ambiguity at source but breaks comparability with June and August |

---

## 10 Traps

Each of these produced confidently wrong output in a real run. They are written here because none of them is visible from reading the source, and several were reimplemented independently by different people on the same day. **Every one should become a regression test.**

| # | Trap | What it cost |
|---|---|---|
| 1 | **A pair score is directional; an edge is not.** Store a mirrored copy on the reverse edge. | 42% of guest-facing explanations described the wrong person, in two implementations, same day |
| 2 | **Substring matching is right for comma-containing multi-selects and wrong for free text.** Use word or prefix boundaries. | `care` in "career", `cto` in "director", `exec` in "Account Executive". An earlier version also matched `ai` inside "Retail" |
| 3 | **Free text contains self-description, not just requests.** Split into clauses, drop self-referential ones, with an override so "I am looking for" survives its own "I am". | A registrant who declined to name anyone was told three people matched her ask |
| 4 | **Negation must be adjacent.** Within two words before, or free/less/agnostic after. | "a mainly vc free company" scored as wanting a VC |
| 5 | **A role field containing a request is empty, not identity.** | "finding a technical cofounder" made her satisfy others' need for a technical person |
| 6 | **Size output columns from assigned degree, not the cap.** | Top-up exceeded the cap; a cap-sized writer silently broke mutuality |
| 7 | **Normalize with NFC, not NFKD.** | Accented LinkedIn slugs stopped being byte-identical |
| 8 | **Count unique pairs, not directed slots.** | Every summary statistic doubled |
| 9 | **Never fabricate a primary key.** Derive from a stable hash of the dedup key, never row position. | Empty IDs plus dedupe collapsed an entire file to one row |
| 10 | **Parse-rate guard.** Refuse to score when under 70 to 80 percent of a field parses. | A pipeline of identical 0.51 fallback scores looked like a working result |
| 11 | **Units detected, never assumed. Timezone signs checked.** | Silent mi to km inflated distances 61%; pandas read UTC-7 as +07:00, a 14 hour error |
| 12 | **NaN is truthy in Python.** `x or fallback` does not do what you think. | Every row without a LinkedIn collapsed into one dedup key, an hour after trap 9 was filed |

> **The meta-lesson, proven three times**
>
> A passing test suite is evidence about the cases someone thought to write down. One package passed 99 tests, then an adversarial review found 19 real defects; fixed, a second review found 11 more. The Sparks matcher passed a 610 of 610 manual audit and has zero automated tests. Assume a third review finds something.

---

## 11 Roadmap

### Next, in order

Reordered 2026-08-24 after the Aug 22 event: guests admitted they never meet their Sparks. A recommendation puts the work on the person; a coordination point puts it on the structure. The roadmap now favours things that make connections happen or record whether they did.

| # | Work | Why now | Blocked on |
|---|---|---|---|
| 1 | Verify and commit the lower-bound patch | Written, 62 of 62 tests green on-device, sitting uncommitted | Jacky reviewing the diff |
| 2 | Logging contract | Every surfaced match records score, config version, action, outcome. Nothing can improve until this exists, and it is cheap now and expensive to retrofit | Nothing |
| 3 | Sparks follow-up message | Two questions: did you find them, want an intro. The only measurement item that is also a connection step, and the cheapest labeled data available | Next event |
| 4 | Structured Sparks moment or pods for the run phase | Sparks produced lists, not meetings. A designated moment or an assigned group converts the recommendation into a coordination point | Next event format decision |
| 5 | Host-app attendance tap | Hosts confirm who showed from the roster; guests do nothing. Free run events never check in | Host app M1 |
| 6 | socialIntent and goal capture in the app | 0.14 of declared weight is empty; the event form already proves people will answer these | Onboarding design |
| 7 | Exploration slot | The counterweight to lower-bound ranking, sequenced here so its data lands somewhere | 2 |
| 8 | Pods and Sparks as host-app templates | Pick a format per event in the app; the engine repo already takes a profile per event | 5 |
| 9 | Overlap-width refinement to pace | The plateau scores a 2-second sliver of overlap like a fully nested range. Blend the gap score with the overlap fraction; the change stays inside `scorePace` / `d_pace`, scorer API untouched. Needs outcome data to tune the blend | 2, and real ranges in the wild |
| 10 | Conditional pace, three stages | Stage 1: capture pace as facts per run context on the weekly template (settings philosophy below). Stage 2: seed a personal pace-distance curve from the one stored range with a Riegel fatigue model, so one number becomes a defensible curve. Stage 3: learn the curve from verified runs once the Activity Graph exists. Scorer unchanged throughout; feature extraction becomes `paceIntervalFor(profile, distance)` | Stage 1 on onboarding redesign; stage 3 on Activity Graph |

### From the patent

- **Claim 18, complementarity.** Asymmetric matching where learning meets teaching. Implemented event-side as direction and topic; not yet in the app.
- **Claim 20, group composition.** Multi-dimensional group scoring, dynamic weighting by activity type and group size, recurring-group lifecycle, group chemistry learned from outcomes. Pods implements a first slice.
- **Claim 21, anti-engagement objective.** Rank on predicted real-world attendance, not engagement. Stated in section 07, unmeasurable until check-in exists.
- **Gap-fill.** Match against what someone's week is missing: `unmet_need = plan − completed − scheduled`, computed before matching. This is what makes a training plan pull people to runs. Designed nowhere, built nowhere.

### Settings philosophy

Ship personalization as facts about someone's life, never as arithmetic. "Saturday 7 to 9am is my long run" and "20 minutes from the Marina", not weight sliders and thresholds. People introspect accurately on facts and badly on tradeoffs, and bespoke weights fragment the learning that would otherwise improve matching for everyone. A weekly template with per-slot intent is simultaneously the settings screen and the gap-fill input.

---

## 12 Where everything lives

| What | Path |
|---|---|
| Event engine (code) | `github.com/jackyminkler/novara-matching`, local at `Documents/Novara/novara-matching` |
| App engine | `novara/firebase/functions/matching/` |
| Its spec | `novara/docs/plans/connect-release/BUILD_PLAN.md` §Matching engine |
| Archive index | `Novara-Brain/03-product/matching/INDEX.md` |
| Specs and handoffs | `Novara-Brain/03-product/matching/specs/` |
| Implementations | `Novara-Brain/03-product/matching/implementations/` |
| Event data | `Novara-Brain/03-product/matching/event-data/` |
| Circe event ops | `Novara-Brain/05-launch/events/matching/` |
| In-app product spec | `Novara-Brain/03-product/prds/shipping/pace-matching-v1-spec.md` |
| Patent sections | `Novara-Brain/07-patent/` |
| Match Console (browser rank) | published artifact |
| Decision inboxes | `MATCHING_INBOX.md` next to every MATCHING.md mirror |
| This document, mirrored | `MATCHING.md` in novara, novara-host, novara-matching and Novara-Brain |

### The update loop

This document is generated: `content.py` renders to both MATCHING.md and the field-guide artifact, byte-reproducibly. Hand-editing a mirror breaks that guarantee and the edit will be overwritten on the next sync. The loop that keeps code and doc from drifting has three legs.

- **Working in Claude Code (or any AI, any checkout).** Read MATCHING.md first; it is in the repo root. Make the code change, run the tests. If a matching decision was made, append a dated block to `MATCHING_INBOX.md` in the same checkout and commit it with the code. Never edit MATCHING.md itself.
- **Back in Cowork.** Say *sweep the matching inbox*. Cowork reads every checkout's inbox, writes the decisions into the decision log here, re-renders both outputs, republishes the artifact at the same URL, syncs all mirrors, and clears the swept blocks.
- **Event runs.** The engine repo and the Match Console need no loop of their own for use; only behaviour changes do. A rank-rule change must land in `rank.py` and the console together, or be logged as a divergence.
- **The safety net (added 2026-08-24).** A long session can be compacted and lose mid-session instructions, so the loop does not rely on any session remembering it. The filing rule is also written into each checkout's `CLAUDE.md`, which Claude Code re-reads at every session start, with the instruction to commit the inbox block *in the same commit* as the change, never at session end. `tools/drift_check.py` in the engine repo mechanically verifies rank.py/console parity on fixture rosters (run it before committing either file). And a weekly scheduled task, Mondays 9am PT, runs the drift check on Jacky's machine and flags unswept inbox blocks.

> **Why an inbox file and not memory**
>
> The inbox is a file in the repo, so it survives the session that wrote it, travels with the commit that motivated it, and is discoverable by the next AI that opens the checkout. Handing decisions between tools through anyone's memory is how the June pod logic got lost.
