# Novara Matching Engine

**Single source of truth.** Version 1.7.0, updated 2026-09-01.

Generated from `content.py`. The published artifact and this file render from the same
source, so they cannot disagree. When this document and the code disagree, the code wins
and this gets corrected.

> Mirrored in `novara`, `novara-host`, `novara-matching` and `Novara-Brain`. Artifact version has
> Plain / Math / Code toggles per section; this file shows all three inline.

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
- Point any AI at this document, in Cowork, Claude Code, or chat. The markdown mirror `MATCHING.md` sits in `novara`, `novara-host`, `novara-matching` and `Novara-Brain`, with a `MATCHING_INBOX.md` beside each one.
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
| `availability` | 0.15 | Two regimes, chosen by the data: shared minutes over the smaller weekly calendar when either side has windows, otherwise shared day and time slots | Yes, once onboarded |
| `runType` | 0.10 | Jaccard overlap of run types | Yes, once onboarded |
| `socialIntent` | 0.08 | Jaccard overlap of stated social intent | **No. Empty until a capture surface exists** |
| `goal` | 0.06 | Same goal or not | **No. Null until a capture surface exists** |
| `genderSoft` | 0.06 | Population lean when no preference is stated | Yes, for anyone who completed onboarding step 7 |

> **Availability is two regimes and a separate gate (2026-08-26, shipped 2026-09-01)**
>
> Availability now works the way pace does, and for the same reason: one number was doing two jobs. **Scoring.** When either side carries the weekly `availabilityDays` template (per-day minute windows, **0 = Monday**), the dimension scores **shared minutes over the smaller weekly calendar**, keeping the same fairness the slot rule had. A slot-only side converts through fixed period bands, morning 360 to 600, afternoon 600 to 1020, evening 1020 to 1260 minutes. Those bands are a *cross-language contract* with the Dart slot bridge, so changing one side alone silently rescores every mixed pair. When neither side has windows the legacy exact-slot scoring stands byte for byte, so the existing pool is untouched. **Gating.** `availabilityMinSharedMinutes`, default 45, Firestore-tunable via `config/matching`, excludes through the same `gatePass` mechanism pace uses, and it measures the longest *contiguous* shared window rather than the total. Score ranks, the knob excludes: a 40 minute sliver of overlap is rankable but not runnable. **Calendars change synthesis, not scoring.** Scoring always reads the recurring template, so pair compatibility is stable and does not churn as someone's meetings move. Only the proposed day and time consults a calendar, down a three-step ladder: both sides' fresh device-derived `effectiveWindows` (synced within 7 days) for the earliest concrete mutual window of 45 minutes or more, stamped `whyMatched.calendarBacked`; then the shared weekly band; then the legacy first-shared-slot at 07:00 / 13:00 / 18:00. **The 0 = Monday index is the hazard worth naming twice:** Novara Hosts indexes weekdays 0 = Sunday, both are plain numbers, and an array crossing that boundary unconverted produces a plausible answer that is wrong by one day.

> **Availability never reaches the server unabstracted**
>
> The privacy invariant is load-bearing rather than a preference. Calendar data derives **on the owner's device**; Firestore holds only open windows as `{s,e,d,m}` on the owner-only preferences document, never on the auth-readable `week` document, never event titles or attendees, and no server-side calendar token exists. **The server therefore cannot re-derive anyone's availability, and that is the point.** It also constrains the consumer app's OAuth scope: device calendar first, then `calendar.freebusy`, which is not a sensitive scope and so never spends from the shared project's non-renewable lifetime allowance of 100 unapproved sensitive-scope grants.

> **0.14 of the declared weight never participates**
>
> socialIntent and goal are structurally empty. Onboarding writes neither, and the schema itself says *null until a capture surface exists*. genderSoft does participate: onboarding step 7 captures gender and preference. Renormalization silently redistributes the empty 0.14, so for a fully onboarded pair the live weights sit nearer proximity 0.349 / pace 0.291 / availability 0.174 / runType 0.116 / genderSoft 0.070 than the published table. Not a bug, but nobody had written it down.

> **The friend graph is deliberately not a dimension**
>
> Knowing someone promotes them. It is never one of the seven scores. Every dimension is renormalized over the weights that had data, and a social dimension always *has* data, since you either are friends or you are not, so it never drops out. A stranger would score 0 on a participating dimension and have that 0 dragged through the denominator: a penalty on strangers wearing a friend feature's clothes, and at launch nearly every pair is two strangers. So it is an additive bonus on the ranking key instead, `rankScore = lbScore + socialBonus`, with `friendBonus` 0.15 for a friend and `friendOfFriendBonus` 0.05 per mutual friend saturating at three, all Firestore-tunable and all zeroed in batch mode. `total` stays a pure fit number, a stranger's rankScore is exactly their lower bound, and because the bonus is applied after the `hardPass` filter it **cannot outscore a gate**. A friend who fails the pace gate is still not surfaced. Friendship promotes; it never rescues. Group tiers stay a function of fit alone, because a "great" tier that really meant "your friend" would be a false statement to the user.

### Pace, in three depths

**Plain.** Your pace is a range, not a number. If two ranges overlap at all, that is a perfect fit. If they do not, compatibility halves for every 60 seconds a mile of gap and never quite reaches zero, so two people far apart can still be ranked against each other instead of tying at the bottom. Whether they are shown to each other at all is a separate question with its own number: a gate at 90 seconds a mile, applied by the surfaces that want one. No cliffs anywhere: 8:58 and 9:02 are four seconds apart and score almost perfectly, where the old band system put them in different bands and scored them worse than a 9:02 and a 9:58. Bands survive only as the fallback for data that was captured as bands, like the event form, where the finer signal never existed.

**Math.** For pace intervals [a_lo, a_hi], [b_lo, b_hi] in sec/mile: gap = max(0, max(a_lo, b_lo) − min(a_hi, b_hi)) s_pace = 0.5 ^ (gap / h), h = 60 s/mile, the half-life withinGate = gap ≤ g, g = 90 s/mile Overlap is a plateau at 1.0. Asymptotic by choice: the score never reaches 0, so ordering survives at any gap and exclusion is the gate's job rather than a side effect of the curve bottoming out. Chen's exponential shape adopted, his unfitted constants still rejected. A half-life is as arguable in a product review as a tolerance was: "compatibility halves every 60 seconds a mile" and "we stop counting at 90" are the same kind of claim. Symmetric, since gap does not depend on argument order. Fallback for bucket-only profiles: same bucket 1.0, halving per band beyond it, so adjacent stays 0.5 and wider bands stay rankable.

**Code.**
```
// core.js (decision 2026-08-25; half-life and gate both Firestore-tunable)
const gapSec = Math.max(0, Math.max(aLo, bLo) - Math.min(aHi, bHi))
const score  = Math.pow(0.5, gapSec / halfLifeSec)  // halfLifeSec = 60 default
const withinGate = gapSec <= gateSec                // gateSec     = 90 default
// overlap -> 1.0 plateau; 60s -> 0.50; 90s -> 0.35; 180s -> 0.13; never 0
// hardDimensions consults withinGate. Nothing consults score == 0 for pace
// bucket-only profiles halve per band; the band gate stays plus or minus one band
// test: 8:58 vs 9:02 (0.955) must beat 9:02 vs 9:58 (0.524)
```

> **Revised 2026-08-25: the curve and the gate are two numbers**
>
> The 90 second tolerance shipped on 2026-08-24 was doing both jobs at once. A hard dimension fails when it has data and scores 0, so the tolerance *was* the gate, and you could not change how pace ranks without changing who gets excluded. It also reinstalled the cliff it was written to remove, at the far end instead of at a band boundary: every pair beyond 90 seconds scored exactly 0, so they all tied and became unrankable. The friends surface found it, being the first mode with no pace gate at all: for a 10:00 runner an 8:00 friend and a 6:30 friend both scored 0 and ordering fell through to availability. Widening the tolerance for that mode only just moved the cliff. Section 02 says a gate belongs in `hardDimensions` and not in the weight vector; a gate expressed as a scoring floor is the same error pointed the other way. Renaming `paceToleranceSec` was safe because the old key had never actually reached the scorer (section 10, trap 14).

### One pace range today; run types infer from it

The app stores exactly one pace range per person (decision 2026-08-24). Run types do not get their own pace question; they get inference rules on that single range: **long runs** track toward the slower end; **social runs** barely weight pace at all; **easy runs** sit middle-to-slow end, and usually at the shortest-to-middle end of someone's preferred distances; **track sessions** weight pace less but still prefer close, because a general pace is a usable proxy for interval pace and overall endurance. None of this touches the scorer: `GROUP_RUNTYPE_PROFILES` in `modes.js` already varies weights per run type (a workout run weights pace 0.15 against the open pool's 0.25), so these rules are per-runType weight and range-endpoint adjustments in config, not new code paths.

> **Three refinements deliberately deferred to the roadmap**
>
> **Overlap width.** The plateau treats a 2-second sliver of overlap and a fully nested range as the same 1.0. A wide-range runner (9 to 11) currently matches a 7:15 to 9:15 runner perfectly on a 13-minute overlap window they would share for about one street corner. The fix blends the gap score with the overlap fraction and lives entirely inside `scorePace` / `d_pace`; the scorer API does not change. **Conditional pace.** One range hides that the same person runs 8 to 9 for 3 to 5 miles and 10 to 11:30 for 6 to 13. The designed path keeps the scorer untouched and makes *feature extraction* context-aware: `paceIntervalFor(profile, distance)` instead of a stored constant. **Mixed precision.** The continuous path runs only when *both* sides carry a numeric range, so an app user's 8:30 to 9:00 meeting a guest who ticked the "8 to 9" band drops both of them to bucket adjacency: precision we already had, discarded because of what the other side was missing. A band is an interval already, [480, 540] seconds, and feeding it through the same gap-and-half-life computation makes bands a low-precision input rather than a separate scoring regime. All three are section 11 roadmap rows.

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
| `rank_friends` | The same shape with the friend list as its pool. Friendship is the gate, fit is the whole ranking. | Friends surface | Shipped in the app 2026-08-25 |
| `global_assignment` | One to one, each match consumes both sides. Sorting is **not** correct; needs Hungarian. | Mentor pairing | In v1 spec, not in app |
| `b_matching` | Mutual edges, degree 3 to 5 per person. | Sparks | Shipped in the engine repo. Profile-driven since 2026-08-25 |
| `group_partition` | One set into groups of k. Optimize the **worst** group, not the average. | Pods | Blockers fixed 2026-08-24. Profile-driven with peer mode since 2026-08-25 |

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

### The friends surface is a mode, not a filter

Filtering the open-pool feed down to friends is the obvious build and it answers the wrong question. The open pool hard-gates pace, availability and proximity, so a friend who runs 11:00 when you run 8:30 never enters the ranked list to be filtered, and the feed caps at 14 proposals, so filtering can return nothing at all. The surface could not tell "not a friend" from "friend the gate dropped", and the friends question is which of my friends should I run with, which omitting a friend answers wrongly. `friendsMode()` loads the pool from `users/{uid}.friendIds` instead, gates on nothing else, and pins the social bonuses to 0, since a constant added to every candidate reorders none of them. The `rankFriends` callable returns friend-of-friend suggestions as a separate list scored under the open-pool mode, because those people are strangers and the discovery gates should apply to them. The scorer was not touched, which is the point.

> **The mode gates on nothing; the pipeline still does (corrected 2026-08-25)**
>
> `friendsMode()` gates on nothing, but `pipeline.rankPool` applies `isEligible()` to every candidate before scoring, so a friend who has not onboarded, has no match profile, has `optedIn === false` or `profileComplete !== true` is dropped before the mode gets a say. `rankFriends.friends[]` is therefore a strict subset of `friendIds`, which is the failure this section exists to prevent arriving through a different door: a surface built from that list alone cannot tell "not a friend" from "friend eligibility dropped". Fixed in the client rather than the engine, deliberately, because skipping eligibility for friends mode would also change who the open pool surfaces and eligibility is doing real work there. `FriendsRankService` diffs `friendIds` against the ranked uids and renders the remainder as an unranked **not matchable yet** list. Nobody vanishes, and nothing claims a fit score that was never computed.

Event-side, the same claim became true on 2026-08-25. Sparks and Pods held their dimensions, weights and vocabularies in code until `formats/sparks/spec.py` and the pods profile lifted them into data, dispatched through a dimension registry keyed by type. A profile that declares no `direction` dimension now runs **peer mode**: Sparks skips the reservation pass that spreads scarce mentors, Pods skips the anchors and does not print a roaming-mentor section. There is no scarce side at a DJ run, and reserving one would invent a hierarchy the event does not have.

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

> **Settled 2026-08-24, shipped: lower-bound ranking, not a hard floor**
>
> `score()` returns `confidence` (the share of the mode's weight backed by real data) and the pipeline ranks by `lb = total − λ·(1 − confidence)`, λ = 0.5, batch mode 0, tunable from the Firestore `config/matching` doc without a redeploy. Thin matches still appear, they just cannot outrank fully-known good ones, so the feed never empties during cold start. A hard floor was considered and rejected for exactly that reason. Committed as `ff180c5` on 2026-08-24 and merged to `main` in PR #199. The Firestore override did not actually reach the scorer until the threading bug was fixed on 2026-08-25, section 10, trap 14.

### The exploration slot, sequenced

Deliberately reserving a feed slot for a high-uncertainty match is the standard counterweight to lower-bound ranking. It is sequenced **behind the logging contract**, not rejected: exploration is a purchase, a probably-worse match today in exchange for learning whether it was actually good, and until outcomes are recorded the learning is never collected. At launch everyone is new, so the whole feed is already exploration. Three of the four logging legs shipped on 2026-08-25 and post-run feedback started collecting self-reported outcomes the same day, so the purchase is closer to payable than it was. The verified half is still owed.

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
- **Optimized today:** fit across the available dimensions, as a proxy, because almost no outcome data exists yet. Post-run feedback began collecting self-reported outcomes on 2026-08-25 and tunes nothing yet.
- **Explicitly not optimized:** clicks, session time, match volume, feed fill rate.

> **Anti-engagement, on purpose**
>
> Patent claim 21 targets predicted real-world attendance rather than engagement. Nothing in the engine optimizes a click. A match that produces a good conversation and no app usage is a success.

### Constraints that sit next to the objective

- Output is always a coordination object, a run, intent, event or slot. Never a bare list of people.
- Every surfaced match should ship a human-readable reason built only from data both sides supplied, and a match the system cannot explain should not be surfaced. **Half true in the app since 2026-08-25.** `synthesizeRun` had shipped a `whyMatched` object with every field hardcoded null, `distanceMiles` through a ternary whose branches both returned null; it now carries real distance, pace-overlap seconds, shared-slot count and the social degree. Surfacing is still not gated on explainability, deliberately, because dropping unexplainable matches thins the feed at exactly the cold start section 05 refuses to starve. The event matchers do enforce it. *Open.*
- A surface states only what the engine claims. The friends list shows **order** and no fit number, badge or reason chip: the order is the answer and the engine already computed it, while a percentage next to a friend's face is a claim about a relationship the engine is not making. `total` and `confidence` reach the client for analytics banding only, and a contract test fails if either is interpolated into copy. A shared-friend count is exempt, because "you both know 3 people" is a count and not a judgement.
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
| **App tests** | `__tests__/matching.test.js`, `feedback.test.js` | **Shipped** | Exhaustive bidirectional-pace regression, the config-doc-to-score threading case, friend-graph and friends-mode cases, and the feedback callables |
| **Lower-bound ranking + continuous pace** | `matching/core.js`, `pipeline.js`, `modes.js`, `config.js` | **Shipped** | confidence returned, lb ranking, continuous interval pace, λ and the pace knobs Firestore-tunable. Committed as `ff180c5` on 2026-08-24, merged to main in PR #199 |
| **Pace curve and gate, split** | `matching/core.js`, `modes.js`, `config.js` | **Shipped 2026-08-25** | `paceHalfLifeSec` 60 and `paceGateSec` 90 replace the single `paceToleranceSec`. Asymptotic score, separate gate, bucket fallback halves per band |
| **Friend graph in ranking** | `matching/core.js`, `modes.js` | **Shipped 2026-08-25** | `socialGraphRelation` and `socialGraphBonus`, additive on the ranking key, zero extra Firestore reads because `friendIds` is already on the user doc. Batch mode zeroes them as it does λ |
| **Friends surface** | `matching/modes.js`, `matching/index.js` | **Shipped 2026-08-25** | `friendsMode()` plus the `rankFriends` callable; friend-of-friend suggestions returned as a separate list scored under open-pool gates |
| **Logging contract** | `matching/pipeline.js`, `config.js` | **Three legs of four** | Full ranking key at surface time, complete `configSnapshot`, `statusUpdatedAt` on transitions. The outcome leg cannot be closed from this repo |
| **Post-run feedback** | `firebase/functions/feedback.js`, `match_feedback` | **Shipped 2026-08-25** | Prompt, not a forced one: attended yes/no, then enjoyment, location, people, `paceFit`, `wouldRunAgainWith`. Mirrored onto the match record. `source: self_report`, scores nothing |
| **Config threading** | `matching/config.js`, `matching/index.js` | **Fixed 2026-08-25** | Firestore-tuned knobs were read and then dropped one call short of the mode builder. Now covered by a test that follows a value from the config doc to a score |
| **Friends and feedback UI** | `lib/connect/friends/`, `lib/feedback/`, `lib/home/components/feedback_banner/` | **Shipped 2026-08-25** | `rankFriends` renders in Connect > Friends with an unranked **not matchable yet** tail; feedback is a dismissible home banner plus a two-step sheet, with `paceFit` leading step 2. Rules, then callables, then UI, then scheduler |
| **Contract test layer** | `test/contracts/` | **Falsification pass owed** | 175 tests across 16 files, roughly 108 of them asserting on file text rather than behaviour, and four files entirely so (`blocking`, `groups`, `friends_wiring`, `pace_match`). Section 11 item 2 |
| **socialIntent capture** | app onboarding | **Not built** | Dimension is weighted 0.08 and always empty |
| **goal capture** | app onboarding | **Not built** | Dimension is weighted 0.06 and always null |
| **Event engine** | `novara-matching` repo (github.com/jackyminkler/novara-matching) | **Profile-driven 2026-08-25** | One CLI, profile JSON per context, formats sparks / pods / rank. Dimensions, weights and vocabularies are data, dispatched by a dimension registry. 37 test cases: 36 in the default suite at about 20 seconds, the pods golden behind `NOVARA_SLOW=1`. `social_sparks_v1` and `social_pods_v1` are the general-event profiles; the social pods fixture places 38 people into 10 pods with no anchors and everyone placed once |
| **Sparks (b_matching)** | `novara-matching/formats/sparks/` | **Ran live + tested** | Ran Aug 21/22 on 153 people. `spec.py` resolves a profile into dimensions, weights, vocabularies, gates and caps; the Circe run reproduces byte for byte across all 610 directed edges, sha256 prefix `2fb3994249a628c6`, pinned as a test |
| **Pods (group_partition)** | `novara-matching/formats/pods/` | **Fixed and generalized** | Both blockers resolved 2026-08-24. Peer mode, renormalized active weights and `topic_columns` added 2026-08-25; the 38-pod Circe baseline reproduces at membership sha256 `23fc887cd40e41b0`, seeded at 42, behind `NOVARA_SLOW=1` because it takes about two and a half minutes |
| **Rank (concierge)** | `novara-matching/formats/rank.py` | **Built** | Any spreadsheet in, top-N per person out. App dimension vocabulary, lower-bound ranking, parse-rate guard |
| **Concierge pace parity** | `novara-matching/formats/rank.py`, `console/matchcore.js`, `console/index.html` | **Ported 2026-08-25** | All three now score `0.5 ** (gap / 60)` with a separate `PACE_GATE_SEC = 90`, matching the app. The `why` string stays gate-derived, so ordering changed and the surfaced set did not: the drift check still reports 100 identical ranked pairs |
| **Match Console (browser)** | published artifact | **Built 2026-08-24** | Rank mode ported line-for-line to JavaScript: drop a CSV, tune weights and λ and the pace half-life, top-N per person with reasons, copy-out CSV. Runs entirely in the browser; the roster never leaves the page. Parity-verified against rank.py on 333 surfaced matches. Prototype for the host-app event-template feature |
| **novara_match_v1** | spec only | **Retired 2026-08-24** | Its architecture is implemented by the app engine and this repo; its spec informed both. The lost package is not worth recovering |
| **Host app integration, rank** | `novara-host/src/lib/matching/` | **Shipped 2026-08-27, merged 2026-09-01** | Rank runs client side in the host app on a **vendored copy of `console/matchcore.js`**, byte-identical below a prepended comment header (sha256 `482b9468…`). Input is the event's approved `hp_people` registrations, serialized with **every answer under its own question text, unrenamed**, because the engine's substring column resolver exists precisely so a host's own signup wording is the column. Runs are stored one document per run at `hp_events/{id}/matching/{runId}` with `engineVersion` stamped, refused over 800 kB. Three distinct empty states: no list linked, none approved, and a form that asked none of the matching questions. Sparks and pods are unchanged and show no run button, since the Python service is not deployed |
| **Host app integration, sparks and pods** | `novara-host` | **Architecture decided 2026-08-24** | Spec at `novara-host/docs/Host_App_Matching_Feature_Spec_v1.md`. Unchanged by the rank work above: both need the Python service, which is not deployed |
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
| Self-reported outcomes | Collection started 2026-08-25. Nothing analysed yet | `match_feedback`, in-app prompt |

> **The measurement gap**
>
> The north star is repeat verified attendance and there is no attendance data at all. Day-of check-in is the single cheapest instrumentation change available, and until it exists every number above is a registration metric wearing a retention costume. Post-run feedback, shipped 2026-08-25, buys a self-reported label at a high response rate and a noisier one: people misremember, and anything standing between a user and their app creates pressure to tap through, which is why the prompt is a dismissible banner and not a modal: a `paceFit` answered to make a dialog go away enters the record indistinguishable from a real one. It is recorded as `source: self_report` so a verified source can sit beside it rather than overwrite it. When the two disagree, the roster wins.

---

## 09 Decision log

### Settled

| Date | Decision | Why |
|---|---|---|
| 2026-08-26 | Availability becomes two regimes with a separate minute gate, and calendars feed synthesis only, never scoring | The same split pace already got: one number cannot both rank and exclude. Windows score shared minutes over the smaller calendar, slots keep the legacy scoring byte for byte, and `availabilityMinSharedMinutes` (45) excludes on the longest contiguous overlap. Scoring reads the recurring template so pair compatibility does not churn as meetings move; only the proposed time consults a calendar. Filed on the consumer availability branch and swept when it merged on 2026-09-01. Section 03 |
| 2026-08-27 | Rank runs in the host app on a vendored, byte-identical copy of `matchcore.js`, making three copies of the rule set | The 2026-08-24 architecture call was one engine, no fork. Vendoring the parity-verified JavaScript is the smallest form of that which does not pull Python into the host repo. The copy is verified by sha256 against the console rather than by `drift_check.py`, which still compares only `rank.py` to the console. **Adding an `export` line was refused**: the file's entire value is being byte-identical, so the UMD wrapper's `self` assignment is read back through a typed wrapper instead. Section 08 |
| 2026-08-27 | Host matching analytics ship `hp_`-prefixed, deviating from the feature spec's names | The spec names them `matching_run_started` and siblings; they ship as `hp_matching_run_started`. Every other event in that repo carries the prefix and one naming scheme beats matching a document. Recorded rather than silently done, and the same call was already made for the CRM events |
| 2026-08-25 | The friends surface shows order, not scores. No fit number, no derived badge, no reason chips | The order is the answer and the engine already computed it. A fit percentage next to a friend's face is a claim about a relationship that the engine is not making. Shared-friend counts are exempt: a count is not a judgement. Section 07 |
| 2026-08-25 | The post-run prompt does not block: a dismissible banner and a notification row, never a modal | A `paceFit` answered to make a dialog go away enters the record indistinguishable from a real one, and `paceFit` is the field this loop most wants. Section 08 previously called it a forced prompt, which contradicted its own warning about tap-through pressure |
| 2026-08-25 | The friends surface reconciles `friendIds` in the client; pipeline eligibility is not skipped for friends mode | Skipping `isEligible()` would also change who the open pool surfaces, and it is doing real work there. The client diffs the ranked uids against `friendIds` and shows the remainder as unranked, so nobody vanishes. Section 04 |
| 2026-08-25 | The concierge tools are ported to the half-life curve and the separate gate, not declared a different profile | `rank.py` speaks the app's dimension vocabulary on purpose. Closes the open row filed the same day. The `why` string stays gate-derived, so the swap reorders pairs without changing which are surfaced |
| 2026-08-25 | A scan-based test is kept only after the bug it fears has been planted and caught | The natural way to write a bug is rarely the spelling the pattern guessed, and a scan matches wherever its spelling sits, comments and doc strings included. One of eleven cases had to be rewritten after failing this check. Section 10, traps 16 and 17 |
| 2026-08-25 | Pace is two numbers: an asymptotic curve with a 60 s/mile half-life, and a separate `paceGateSec` of 90 s/mile. Revises the 2026-08-24 tolerance | One number was doing two jobs, so ranking could not be changed without changing who is excluded, and every pair beyond the tolerance tied at 0 and became unrankable. Chen's shape is now implemented and not merely cited. Section 03 |
| 2026-08-25 | The friend graph is an additive bonus on the ranking key, never an eighth dimension | A social dimension always has data, so a stranger's 0 would be dragged through the renormalized denominator: a penalty on strangers, not a bonus for friends. Applied after `hardPass`, so it cannot rescue a gate. Section 03 |
| 2026-08-25 | Friends are a mode with the friend list as its pool, not a filter over the open-pool feed | The open pool gates pace, availability and proximity, so filtering silently omits exactly the friends the gates dropped, and the surface cannot tell that from having no friends. Section 04 |
| 2026-08-25 | Logging contract: ranking key, full config snapshot and action timestamps written at surface time. The outcome leg stays open | `total` alone loses why one pair outranked another, the social bonus is unrecomputable later because `friendIds` moves, and two runs at different λ used to write byte-identical records. Section 08 |
| 2026-08-25 | Post-run feedback is collected as `self_report` and used for nothing yet | Collecting outcomes and tuning on them are separate decisions; shipping unfitted constants is the mistake this log already records once. `paceFit` is the first signal that can settle the pace numbers with evidence. When self-report and a verified roster disagree, the roster wins |
| 2026-08-25 | Sparks and Pods are profile-driven; a profile with no `direction` dimension runs peer mode | "A mode is data" was true of rank and false of the event formats. Peer mode skips the mentor reservation pass and the anchors, because a social run has no scarce side to reserve. Section 04 |
| 2026-08-25 | A blank pace in the event matchers is unknown, not a zero gap | `pace_gap` returns None instead of raising or reading as a perfect match, so the gate cannot apply and the dimension drops out. Scoring a blank as gap 0 could have put someone in the fastest wave by accident. Zero rows in the Circe export were affected, so nothing moved. Same family as trap 13 |
| 2026-08-25 | Golden-run reproduction is a test, by hash | Aggregate counts pass while individual pairings shuffle. Sparks pins sha256 `2fb3994249a628c6` over all 610 directed edges; pods pins membership `23fc887cd40e41b0` at seed 42 |
| 2026-08-24 | Host-app matching is an event-template capability: rank runs in-app on the ported `matchcore.js`, sparks and pods stay Python-canonical behind a Cloud Run service the app calls | Forking ~500 lines of sparks and ~900 lines of pods, both pandas-based and the most correctness-critical code there is, into TypeScript would create a permanent two-language drift burden, so the section 12 drift rule is not widened. Sparks and pods require the Circe mentor columns and error on app-user exports while rank runs on them, 109 of 148 app users matched, so the template has to surface the registration questions a mode needs before the event |
| 2026-08-24 | `confidenceLambda` and the pace constants are named constants threaded through every mode builder and overridable from `config/matching`; batch mode pins λ and the social bonuses to 0 | The knobs most likely to need tuning against live match quality should not require a functions deploy. Admin tooling needs the raw score ordering, not the confidence-penalized one. Half-wired until the threading fix of 2026-08-25 |
| 2026-08-24 | Decisions made in code sessions land in `MATCHING_INBOX.md`, swept into this doc from Cowork | MATCHING.md is generated and must never be hand-edited; the inbox next to each mirror gives Claude Code a place to log decisions that provably flows back. Section 12, the update loop |
| 2026-08-24 | The Match Console mirrors `rank.py`; a change must land in both or be logged as a divergence | Two implementations of one rule set is the drift that section 10 exists to prevent. The console header pins the engine version it mirrors |
| 2026-08-24 | One stored pace range per person; run types infer from it. Long runs use the slower end, social runs barely weight pace, easy runs sit middle-to-slow at shorter distances, track prefers close as an endurance proxy | Per-runType inference is config on one honest number, not four more onboarding questions. Overlap-width and distance-conditional pace deferred to the roadmap with the architecture already shaped to take them. Section 03 |
| 2026-08-24 | Continuous interval pace with a 90 s/mile linear tolerance; bucket adjacency only as the fallback for band-only data | Bands put 8:58 and 9:02 in different bands (0.5) while scoring 9:02 vs 9:58 perfect (1.0). Chen's no-cliff shape adopted; his unfitted constants rejected; linear because a tolerance is arguable and a decay constant is opaque. **Revised 2026-08-25:** the linear form removed the cliff at band boundaries and installed a new one at 90 seconds, and the tolerance was silently also the gate |
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
| **App tolerances** | pace half-life 60 s/mi and gate 90 s/mi, distance 5 km, time 90 min, near-miss ceiling 0.25, `friendBonus` 0.15, `friendOfFriendBonus` 0.05 saturating at 3 | All starting values, explicitly labelled as guesses. `paceFit` from post-run feedback is the first evidence that can settle the pace pair, because it grades the range we matched on in the user's own words |
| **Elastic pace gate for pods** | Relax only below the minimum pod size, or to improve mean affinity; by one wave or two; for the closest pace or for the highest non-pace affinity | Sparks already has the primitive (`pace_band_gap_relax`) and can degrade by giving someone fewer edges. Pods is a partition: it fills or it strands people. The honesty question does not bite here, because a pod is a coordination object with an announced pace rather than a match carrying a per-person reason. What is unsettled is quality: a relaxed placement can make the run worse for everyone else in that pod, and section 04 optimizes the worst group. Expressible only since the gate became a separate number from the curve |
| **Friend bonus in the open pool** | Keep 0.15, or drop it to 0 and let the friends surface own the relationship, possibly raising the friend-of-friend bonus | The open pool exists to find people more like you, not people you already know, so a first-degree bonus there arguably spends a discovery slot twice. A friend-of-friend genuinely is discovery. Needs outcome data; not settled |
| **Blank answers in the Circe dimensions** | Leave them scoring 0 at full weight, or make them drop out the way section 05 says | `topic`, `industry` and `goal` return 0.0 for nothing to work with while reporting `has_data = True`, so a registrant who skipped an optional question ranks as a bad match rather than an unknown one. Fixing it moves the golden numbers, so it has to be decided on purpose. The newer `tag_overlap` and `symmetric_dir` types already do it the section 05 way |
| **Pod seeding in peer mode** | Keep `mentor_strength`, or seed on spread across the interest vocabulary | On a social form nobody has stated topics, seniority words or investor status, so strength is near zero for everyone and seeding is close to arbitrary. The local search converges anyway, but "soft anchor" is the wrong name for what it selects on a peer run |
| **Saturation** | Soft, always drop AI and IDF-weight the rest, or strict hard-drop above 40% | Strict zeroed three of six topics on a 153-person room. Soft above ~100 people |
| **Form redesign** | Split intent into two questions, or keep and parse | Splitting removes the ambiguity at source but breaks comparability with June and August |
| **Runtime parity across the three implementations** | A third drift runner that reads the live `config/matching` doc and compares effective values, or one that asserts no override key is set at all and fails loudly if any appear | Source-level parity was verified on 2026-08-28 and all six literals agree, so nothing is wrong today. What is unguarded is the runtime path: `config/matching` is the declared live tuning surface for the calibration pass, read through `config.js:41-42` and `loadWeights()`, threaded as `scoringOverrides(cfg)` and `rankingOverrides(cfg)` into the mode builders at `matching/index.js:70,414,475,515,548`, and consumed at `core.js:193-194` and `modes.js:147-150`. Comparing source literals cannot see any of it. Trap 18. Evidence in `novara/docs/audits/2026-08-28-prd-v2-vs-code-delta.md` |

---

## 10 Traps

Each of these produced confidently wrong output in a real run. They are written here because none of them is visible from reading the source, and several were reimplemented independently by different people on the same day. The last three are traps in the checks rather than in the engine, and trap 18 is a hole that has not fired yet. **Traps 1 to 14 each have a regression test; the status column says which, what is still live, and what is owed.**

| # | Trap | What it cost | Status |
|---|---|---|---|
| 1 | **A pair score is directional; an edge is not.** Store a mirrored copy on the reverse edge. | 42% of guest-facing explanations described the wrong person, in two implementations, same day | **Fixed.** `test_trap1_mirrored_metadata`, checking all 610 directed slots |
| 2 | **Substring matching is right for comma-containing multi-selects and wrong for free text.** Use word or prefix boundaries. | `care` in "career", `cto` in "director", `exec` in "Account Executive". An earlier version also matched `ai` inside "Retail" | **Fixed.** `test_trap2_word_boundaries` |
| 3 | **Free text contains self-description, not just requests.** Split into clauses, drop self-referential ones, with an override so "I am looking for" survives its own "I am". | A registrant who declined to name anyone was told three people matched her ask | **Fixed.** `test_trap3_self_description_vs_request` |
| 4 | **Negation must be adjacent.** Within two words before, or free/less/agnostic after. | "a mainly vc free company" scored as wanting a VC | **Fixed.** `test_trap4_adjacent_negation` |
| 5 | **A role field containing a request is empty, not identity.** | "finding a technical cofounder" made her satisfy others' need for a technical person | **Fixed.** `test_trap5_role_field_as_request` |
| 6 | **Size output columns from assigned degree, not the cap.** | Top-up exceeded the cap; a cap-sized writer silently broke mutuality | **Fixed.** No test of its own; the mutuality assertions cover the consequence on both the golden and the peer path |
| 7 | **Normalize with NFC, not NFKD.** | Accented LinkedIn slugs stopped being byte-identical | **Fixed.** `test_trap7_nfc_not_nfkd` |
| 8 | **Count unique pairs, not directed slots.** | Every summary statistic doubled | **Fixed.** No test of its own; 305 unique edges and 610 directed slots are both pinned, and the pace-gap test dedupes explicitly |
| 9 | **Never fabricate a primary key.** Derive from a stable hash of the dedup key, never row position. | Empty IDs plus dedupe collapsed an entire file to one row | **Fixed.** `test_trap9_no_fabricated_key` |
| 10 | **Parse-rate guard.** Refuse to score when under 70 to 80 percent of a field parses. | A pipeline of identical 0.51 fallback scores looked like a working result | **Fixed.** `test_trap10_parse_rate_guard` |
| 11 | **Units detected, never assumed. Timezone signs checked.** | Silent mi to km inflated distances 61%; pandas read UTC-7 as +07:00, a 14 hour error | **Fixed.** `test_trap11_units_detected_not_assumed` |
| 12 | **NaN is truthy in Python.** `x or fallback` does not do what you think. | Every row without a LinkedIn collapsed into one dedup key, an hour after trap 9 was filed | **Fixed.** `test_trap12_nan_truthy_dedupe` |
| 13 | **A schema layer that coerces null to a zero makes absent indistinguishable from a measurement.** Guard at the boundary, and check what your out-of-range clamp does with it. | A profile that never had a pace written reached the engine as 0/0. The bucket path found no containing bucket, hit the clamp and returned band 0, filing the user as a 6:00 to 7:00 runner and matching them at a perfect 1.0 against the fastest people in the pool. The continuous path read the same 0/0 as a nine minute gap and hard-failed them out of the pool entirely. Same root cause, opposite symptoms, neither one errors | **Fixed 2026-08-24.** App side: 0 reads as absent and 0/0 derives no buckets. Event side: `test_pace_gap_is_none_not_zero_when_unanswered` |
| 14 | **A config value that is read but never passed on is silently the default.** Test the journey from the config doc to a score, not each half separately. | `confidenceLambda` and the pace tolerance were loaded from Firestore and dropped one call short of the mode builder, so editing the config doc changed nothing. The social knobs inherited the same gap. Both halves passed their unit tests | **Fixed 2026-08-25.** Three end-to-end tests drive `generateForUsers` from a seeded config doc; the old helper-composition test was relabelled honestly |
| 15 | **A dimension that returns 0 for "nothing to work with" while reporting that it has data is a penalty for not answering.** | Circe registrants who skipped an optional question rank as bad matches rather than unknown ones. Still live, deliberately: fixing it moves a golden baseline (section 09, open) | **Live by decision.** The newer dimension types drop out correctly (`test_blank_answer_drops_out_rather_than_scoring_zero`); the five Circe types still score 0 at full weight. Gated on the section 09 open row, and it costs someone placement at every Circe-style event with an optional question |
| 16 | **A test that reconstructs the code path instead of calling it passes for exactly the reason the bug exists.** Construct the check so the wrong hypothesis would produce a different result; if it would produce the same result, the check is decoration. And when every input you have makes the two hypotheses agree, go build an input where they disagree. | The test that claimed to guard the config-threading regression rebuilt the call site inside itself, so reverting `index.js` to the buggy version left it green. The pods suite asserted `active_weights()` returns the right vector and never that anything calls it; no integration test could have caught that either, because the helper is a no-op for both profiles that exist. Four instances across three sessions in one day, plus a fifth in a source scan and a production record whose two candidate owners were the same string | **Rule adopted, sweep owed.** Every instance found has been fixed and pinned in both repos, including `test_build_affinity_actually_consumes_active_weights`. Nothing has re-examined the rest of either suite. Section 11 item 2 |
| 17 | **A source scan asserts a spelling, not a property, and it matches that spelling wherever it sits.** Narrow the scan to the region the property lives in, prefer a regex over a literal, and take a behavioural test whenever a seam makes one available. | A guard that the widget never renders the fit score scanned for `.total}`; the realistic regression interpolates `.total ` and passed clean. Two later attempts at the same guard tripped on the word "profile" inside the widget's own comment, then on an apostrophe in that comment opening a phantom string literal. Roughly 108 of the 175 contract tests are scans, and at the observed one-in-eleven rate about ten of them currently guard nothing | **Rule adopted, sweep owed.** One scan was rewritten and every contract case added on 2026-08-25 was falsified before it was kept. Roughly 108 existing scans are unaudited, four files entirely so. Section 11 item 2 |
| 18 | **A parity check that compares source literals is blind to a value the code reads at runtime.** Compare effective values, or assert that no override is set at all and fail loudly if one appears. | Source parity holds: `PACE_HALF_LIFE_SEC` 60, `PACE_GATE_SEC` 90 and `DEFAULT_LAMBDA` 0.5 in the concierge tools match `DEFAULT_PACE_HALF_LIFE_SEC` and `DEFAULT_PACE_GATE_SEC` in `core.js:143,149` and `DEFAULT_CONFIDENCE_LAMBDA` in `modes.js:32`. But the consumer constants carry the `DEFAULT_` prefix because `config/matching` overrides them live, by design and with no redeploy, and the concierge tools hardcode theirs at module level with no override path. So "one engine, two surfaces" can become false by editing one Firestore document, with every source file unchanged and every source-level check still green. A check that returns the same answer whether or not the problem exists is the shape trap 16 names | **Open, audited 2026-08-28.** No code change; the fix is the section 09 open row. Two naming traps for whoever writes the runner: the consumer lambda is `DEFAULT_CONFIDENCE_LAMBDA`, not `DEFAULT_LAMBDA`, and it lives in `modes.js`, not `core.js`, so a runner written against the obvious name and file finds neither and passes vacuously |
| 19 | **A scan that looks for forbidden words is tripped by the code's own explanation of why they are forbidden.** Strip comments before matching, or the more carefully a file documents its invariant the more certainly its guard fails. | The first draft of the privacy contract test scanned the availability write path for `title` and `attendees` to prove neither ever reaches Firestore. It failed on the privacy comments that say those fields must never be written. The rule already existed as trap 17's narrow-the-region advice; this is the same failure with the sign flipped, since here the comment is evidence the invariant is understood and the scan reads it as a violation | **Fixed 2026-08-26.** The contract test strips comments before matching (AVAIL-03). Filed on the consumer availability branch, swept 2026-09-01 |

> **The meta-lesson, proven three times**
>
> A passing test suite is evidence about the cases someone thought to write down. One package passed 99 tests, then an adversarial review found 19 real defects; fixed, a second review found 11 more. The Sparks matcher passed a 610 of 610 manual audit and has zero automated tests. Assume a third review finds something.

---

## 11 Roadmap

### Next, in order

Swept 2026-08-25: the lower-bound patch merged and the logging contract lost three of its four legs, so what remains of it is the outcome leg, which cannot be closed from the app repo. Reordered 2026-08-24 after the Aug 22 event: guests admitted they never meet their Sparks. A recommendation puts the work on the person; a coordination point puts it on the structure. The roadmap now favours things that make connections happen or record whether they did.

| # | Work | Why now | Blocked on |
|---|---|---|---|
| 1 | Outcome leg of the logging contract | Three legs shipped 2026-08-25: ranking key, config snapshot, action timestamps. Self-reported feedback is collecting, but the north star is *verified* attendance and no verified source exists anywhere | 5, the host-app attendance tap |
| 2 | Falsify the scan-based contract tests | Roughly 108 of 175 contract tests assert on file text, four files entirely so. Plant the bug each one fears, confirm the scan catches it, rewrite what does not. At the observed one-in-eleven failure rate that is about ten tests guarding nothing | Nothing. Sequenced before the batched App Store build, because a test that guards nothing is most dangerous when a large unreleased change finally ships |
| 3 | Sparks follow-up message | Two questions: did you find them, want an intro. The only measurement item that is also a connection step, and the cheapest labeled data available | Next event |
| 4 | Structured Sparks moment or pods for the run phase | Sparks produced lists, not meetings. A designated moment or an assigned group converts the recommendation into a coordination point | Next event format decision |
| 5 | Host-app attendance tap | Hosts confirm who showed from the roster; guests do nothing. Free run events never check in | Host app M1 |
| 6 | socialIntent and goal capture in the app | 0.14 of declared weight is empty; the event form already proves people will answer these | Onboarding design |
| 7 | Exploration slot | The counterweight to lower-bound ranking. Its data now has somewhere to land, so what is missing is the outcome that says whether the gamble paid | 1 |
| 8 | Pods and Sparks as host-app templates | Pick a format per event in the app; the engine repo takes a profile per event and, since 2026-08-25, drives its scoring semantics from it too. Architecture decided 2026-08-24: rank in-app on `matchcore.js`, sparks and pods behind a Cloud Run service, no TypeScript fork | 5 |
| 9 | Overlap-width refinement to pace | The plateau scores a 2-second sliver of overlap like a fully nested range. Blend the gap score with the overlap fraction; the change stays inside `scorePace` / `d_pace`, scorer API untouched. Needs outcome data to tune the blend | 1, and real ranges in the wild |
| 10 | A band is an interval: one pace regime instead of two | The continuous path needs both sides numeric, so a stored 8:30 to 9:00 meeting a ticked "8 to 9" band falls back to bucket adjacency and throws away precision we had, because of what the other side lacked. Treat a band as the interval it already is and both go through the same gap-and-half-life computation. This is section 01's founding move applied to the pace field itself, and it makes conditional pace nearly free, since a learned pace is just a narrower interval. Open-ended bands need the clamping `PACE_BUCKETS` already does | Nothing. Touches `core.js`, `rank.py` and both console copies |
| 11 | Conditional pace, three stages | Stage 1: capture pace as facts per run context on the weekly template (settings philosophy below). Stage 2: seed a personal pace-distance curve from the one stored range with a Riegel fatigue model, so one number becomes a defensible curve. Stage 3: learn the curve from verified runs once the Activity Graph exists. Scorer unchanged throughout; feature extraction becomes `paceIntervalFor(profile, distance)` | 10, then onboarding redesign for stage 1 and the Activity Graph for stage 3 |
| 12 | Pace-free contexts | A yoga partnership, a walking event, sparks at the post-run coffee or the DJ set: contexts where pace is not a dimension at all rather than an unknown one. Section 02 already has the vocabulary, **Irrelevant**, weight zero because the context fixed it, and since the gate became a separate threshold a profile that declares no pace dimension has no gate to fail. The work is in the event-side selectors: sparks drops its band gate, pods needs something other than pace waves to partition on | 8 |

### From the patent

Every claim below is either implemented, sequenced, or explicitly not sequenced. The third column is the honest one.

| Claim | What it is, and where it stands | Roadmap |
|---|---|---|
| **18, complementarity** | Asymmetric matching where learning meets teaching. Implemented event-side as direction and topic. The app declares `socialIntent` and `goal`, weights them 0.14, and leaves them empty | Item 6 captures the dimensions. **Nothing sequences the asymmetric scoring itself in the app**, which is the claim rather than the capture |
| **20, group composition** | Multi-dimensional group scoring, dynamic weighting by activity type and group size, recurring-group lifecycle, and group chemistry learned from outcomes. Pods implements the first of those four | Item 8 puts pods in the app. **Lifecycle and learned chemistry are not sequenced**; chemistry cannot start before item 1 records outcomes |
| **21, anti-engagement objective** | Rank on predicted real-world attendance rather than engagement. Stated in section 07 and unmeasurable until check-in exists | Items 5 then 1. This is the one claim the roadmap is already pointed at |
| **Gap-fill** | Match against what someone's week is missing, `unmet_need = plan − completed − scheduled`, computed before matching. This is what makes a training plan pull people to runs | **Not sequenced.** Item 11 stage 1 builds the weekly template it would read from, which is the input and not the feature |

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
| Host app matching spec | `novara-host/docs/Host_App_Matching_Feature_Spec_v1.md` |
| General social profile design | `novara-matching/docs/general-social-matching-design-v1.md` |
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
- **Event runs.** The engine repo and the Match Console need no loop of their own for use; only behaviour changes do. A rank-rule change must land in `rank.py` and the console together, or be logged as a divergence. There are **three** copies of that rule set, not two: `console/index.html` inlines its own matchcore for the published artifact, and the pace port on 2026-08-25 updated it by hand after the other two were done, which is the drift the check exists to prevent occurring in the one place the check was not looking. `drift_check.py` now compares every scorer body and the shared constants across all three.
- **The safety net (added 2026-08-24).** A long session can be compacted and lose mid-session instructions, so the loop does not rely on any session remembering it. The filing rule is also written into each checkout's `CLAUDE.md`, which Claude Code re-reads at every session start, with the instruction to commit the inbox block *in the same commit* as the change, never at session end. `tools/drift_check.py` in the engine repo mechanically verifies rank.py/console parity on fixture rosters (run it before committing either file). And a weekly scheduled task, Mondays 9am PT, runs the drift check on Jacky's machine and flags unswept inbox blocks.

> **What the drift check does not see (added 2026-08-28)**
>
> `tools/drift_check.py` lives in the engine repo and reads **that repo's** `MATCHING_INBOX.md` only, and its finding is a warning that does not change the exit code. Blocks filed in `novara`, `novara-host` or Brain are invisible to it. That is how seven blocks sat unswept in the `novara` inbox from 2026-08-25 to 2026-08-28, under a stale *nothing pending* marker, while the check reported clean and the `novara` mirror of this document sat at version 1.5.0 with eight of its thirteen sections stale, including the two corrections filed against sections 04 and 08. Its parity leg has the matching blind spot, one layer down: it compares source literals, and the consumer constants are runtime-tunable. See trap 18. Until a check reads every inbox, the sweep is the only thing that catches this, so run it on a schedule rather than on a warning.

> **What filing does not cover: a branch that never lands**
>
> `ff180c5` was correct, committed and pushed, and stacked linearly on a branch carrying two unrelated concerns, the live `hp_` rules batches and the users-PII remediation. None of the three could ship without the others, so all three stayed invisible for weeks, and a later session read the clean `main` checkout as evidence the work had been lost and nearly rebuilt it from scratch. It landed in PR #199. The filing discipline covers decisions; nothing yet notices work that is filed, committed and still unmerged. Until something does, read a **Shipped** row in section 08 as shipped somewhere, and check what it is stacked on. **A second instance, found on 2026-08-28:** three unmerged branches in `novara` (`c210f71` proposedRuns lifecycle, `530fcc1` two-regime availability, `52836da` the confirm-sheet claim race) each carry an inbox block that exists in no checkout on `main`. A sweep reads the inboxes it can see, so a decision filed correctly on a branch that has not landed is invisible to it. Those three were deliberately not swept: a decision from work that may never merge does not belong in this document until it does. **Resolved for two of the three on 2026-09-01, and the third resolved into a different finding.** The availability branch merged and its block is swept into sections 03, 09 and 10 above. `c210f71` is still unmerged and still correctly unswept. `52836da` merged carrying **no inbox block at all**, and the reason turned out to be a third failure mode worth its own name. The confirm-sheet block *had* been written. It was sitting **uncommitted in a worktree** since 2026-08-27, alongside the code and tests it documented, so it existed in no ref and no branch could have carried it. The filing rule says commit the block *in the same commit* as the code change; here nothing was committed at all, and a scheduled worktree prune was one run from deleting all three files. Recovered, committed and pushed on 2026-09-01 as PR #213. **So the risk is wider than an unmerged branch:** a decision can also be lost to a checkout nobody committed, and a branch-based search will report it as never filed. Neither an inbox sweep nor a branch audit sees uncommitted work; only `git status` in every worktree does.

> **Why an inbox file and not memory**
>
> The inbox is a file in the repo, so it survives the session that wrote it, travels with the commit that motivated it, and is discoverable by the next AI that opens the checkout. Handing decisions between tools through anyone's memory is how the June pod logic got lost.
