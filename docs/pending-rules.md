# Pending Firestore rules and indexes

This repo never deploys Firestore rules, indexes, or Storage rules. The consumer app repo owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared `novarasocial-dev` project.

Workflow: when a new or changed `hp_` collection needs a rules match block, a composite index, or (from M1) a Storage rules path, the exact definition gets written under Pending below and surfaced to Jacky. She applies it through the consumer repo, then the entry moves to Applied with the date. Queries that need a composite index fail at runtime until the index is applied and built, so entries land here as soon as the query is written.

Reminders for whoever writes entries here:

- Every `hp_` collection needs its own explicit match block with the owner condition (`hpOwns()` / `hpOwnsNew()`). Rules cannot wildcard a collection-name prefix. The `hp_config/allowlist` gate this used to say was retired on 2026-08-25; see the open signup entry below.
- Never a collection-group rule (`match /{path=**}/name/`). Those span the consumer app's subcollections in the shared ruleset.

## Pending

### How to apply these four blocks

Enough that this file can be handed over on its own.

**Where they go.** In the consumer repo, `firebase/firestore.rules`, immediately after the
`hp_feedback` block and before the closing braces, at the same nesting as every other `hp_` block.
They call `hpOwns()` and `hpOwnsNew()`, which are defined just above them in that same scope, so
pasting them anywhere else silently breaks the reference.

**`hp_availabilitySettings` is not `hp_availability`.** That file already has an `hp_availability`
block, which is the day-level away and open bands from F10. The new one is a different collection
with an unhelpfully similar name, and it is the most likely thing for someone to "correct" into a
duplicate or skip as already covered. Both need to exist.

**Nothing else in the file changes.** No helper edits, no changes to existing blocks, no index
file changes, no Storage changes.

**Verified 2026-08-26: `main` is safe to deploy from.** The stranding recorded under Applied below
is resolved. The consumer repo's `main` now carries the open-signup form of `hpIsHost()` (read the
function body, not a grep, per the trap recorded below), plus the `hp_feedback` and `hp_people`
blocks. So unlike on 2026-08-25, deploying rules from `main` no longer reverts open signup.

**Then do the two things that went wrong twice before.** Read the deployed ruleset back from the
Firebase Rules API to confirm the blocks are live, rather than trusting the checkout. And merge
whatever branch you deployed from into `main` the same day: both previous incidents were a deploy
treated as final while the merge was treated as tidying.

### Personal availability: `hp_availabilitySettings`, `hp_friendLinks`, `hp_bookings`

Written 2026-08-26 for F14 to F19. Three new top-level collections. Nothing in the app can reach
them in `firebase` data mode until these blocks are applied, so this is the gate on taking the
feature off mock.

`hp_availabilitySettings` is keyed by uid, one document per host, so the owner check is on the
document id rather than a field. **Apply it verbatim rather than folding it into the `hpOwns()`
shape for consistency.**

The document does carry an `ownerUid`, so `hpOwns()` would also work, and that is exactly why this
needs saying: the reason is not that the other form fails. It is that a document-id check does not
depend on a field having been written correctly. The id *is* the owner, so no write, however
buggy, can produce a document whose id and `ownerUid` disagree in a way the rule would accept.
`hpOwns()` trusts a field; this trusts the address.

```
match /hp_availabilitySettings/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}

match /hp_friendLinks/{linkId} {
  allow read: if hpOwns();
  allow create: if hpOwnsNew();
  allow update, delete: if hpOwns();
}

match /hp_bookings/{bookingId} {
  allow read: if hpOwns();
  allow create: if hpOwnsNew();
  allow update, delete: if hpOwns();
}
```

**Guests are not in these rules on purpose.** A friend holding a booking link never touches
Firestore. `hpGuestView` and `hpGuestSubmit` read and write these three collections with the
Admin SDK, which bypasses rules by design, and scope every access by hand to the one friend
link the token names. The rules above only have to answer "may this signed-in host reach her own
rows", same as every other `hp_` collection.

**No composite index needed.** The one non-trivial query is in the guest function:
`hp_bookings` where `ownerUid ==` and `status ==`. Two equality filters are served by the
single-field indexes Firestore builds automatically. If an `orderBy` is ever added to that
query, it becomes a composite index and belongs back in this file before the query ships.

**One schema change to an existing collection, no rules change.** `hp_guestTokens` documents
now carry `eventId: null` for the `booking` and `huddle` scopes, where every other scope carries
an event id, plus a nullable `expiresAt`. Nothing in the current ruleset reads either field, so no
block changes. Worth knowing because these are the first guest tokens not scoped to an event.

### Personal availability, part two: `hp_huddles`

Written 2026-08-26. One more top-level collection, same shape of block as the three above.

```
match /hp_huddles/{huddleId} {
  allow read: if hpOwns();
  allow create: if hpOwnsNew();
  allow update, delete: if hpOwns();
}
```

**Guests are again absent on purpose, and here it matters more.** A huddle link is the one link
in the product handed to a whole group rather than one person, and the people on it write to the
document: joining adds a participant, voting changes a tally. None of that goes through Firestore.
`hpGuestSubmit` does it with the Admin SDK, bounded by hand: names are capped at 80 characters,
free-time lists at 500 entries, a vote must be a run of digits, and one participant holds one vote
that moves rather than accumulates. The rules above only answer whether the signed-in host can
reach her own huddles.

**Still no composite index.** `hp_huddles` is only ever read by `ownerUid` for the host list and
by document id for the guest function.

## Applied

### Open signup and `hp_feedback`

**Deployed 2026-08-25 and verified live.** Read back from the Firebase Rules API for
`novarasocial-dev` (ruleset `93d30a9e-b1b5-4630-8f84-23b689a43bae`), not from a checkout: the
deployed ruleset carries the open-signup `hpIsHost()`, the `hp_feedback` block, and `hp_config`
denied to everyone. All three landed.

**They were stranded off `main` for a day, and no longer are.** They were deployed from an
unmerged branch, `hp-rules-open-signup-feedback` (`1518957`). `main` at `bc1057a` still had the
allowlist form of `hpIsHost()` and no `hp_feedback` block, so a `firebase deploy --only firestore`
from `main` would have reverted open signup and dropped `hp_feedback`, locking out new signups and
breaking the feedback button. Owner scoping and `hp_people` would have survived, so the damage
would have been partial rather than total, which is what would have made it easy to miss.

**This is the second time in one day.** The same thing happened with `b88363f`, applied to
production on 2026-08-19 and stranded off `main` until PR #199 merged it on 2026-08-24. Twice in
twelve hours is a workflow, not an accident: rules get deployed from the branch they were written
on and the merge is treated as tidying. The deploy is the thing that feels final, so nothing
downstream forces the merge. Worth a guard, for example refusing to deploy rules from a ref that is
not an ancestor of `main`.

**Resolved 2026-08-26: that branch merged as PR #204.** Consumer `main` pinned at `a781b62`
carries the open-signup form of `hpIsHost()`, `hp_config` denied to everyone, and the
`hp_feedback` block. Settled by reading the function bodies, not by grepping for the expression,
per the trap below. The only surviving `allowlist` matches in that file are four comment lines;
no live condition reads it. Deploying rules from `main` is safe again. Nothing needed redeploying;
production was correct throughout.

**Production re-verified first-hand the same day**, from the consumer repo, which unlike this one
has the Firebase MCP: the deployed `novarasocial-dev` ruleset was read back through the Rules API
and its `hp_` section matches `main` at `a781b62`: the same ten blocks (`hp_config`, `hp_orgs`,
`hp_events` with its five subcollections, `hp_templates`, `hp_contacts`, `hp_availability`,
`hp_moments`, `hp_guestTokens`, `hp_people`, `hp_feedback`), open-signup `hpIsHost()` included.
Deployed, `main`, and this repo's `emulator/firestore.rules` now agree.

**A third grep trap, caught this time.** Checking whether `main` had the change,
`grep -c "sign_in_provider != 'anonymous'"` returned 1 and looked like a pass. It was matching a
different, consumer-side function that happens to use the same expression; `hpIsHost()` two lines
away still read the allowlist. Reading the function body is what settled it. Same failure as the
two recorded above: a grep answers "does this string appear", never "does this thing exist".

### Open signup: `hpIsHost()` no longer reads the allowlist

Written 2026-08-25. Jacky's call: no gate at all, anyone signed in gets their own workspace, with
new users welcome as testers and early adopters. **This supersedes PRD section 0.4 and the
allowlist line in CLAUDE.md**, both of which are updated in the same change.

**Why this is safe, and it only is because of the order things shipped.** The allowlist was a
coarse fence in front of a shared pile of data: everyone behind it could read everything. Owner
scoping went live earlier today, and `hpOwns()` is enforced on every document in every `hp_`
collection. So "anyone signed in" and "anyone on a list" are equally safe now, because neither one
can read the other's rows. Doing this before owner scoping would have handed the whole database to
anyone with a Google account.

It also removes a billed `get()` from every single operation: `hpIsHost()` no longer fetches
`hp_config/allowlist` to answer.

Anonymous sign-in is excluded explicitly. It is not enabled on this project and must not be, since
it would hand a throwaway session a workspace. The condition says so rather than relying on the
setting staying off.

`hp_config` goes to `allow read, write: if false`. Nothing reads it any more: the client check is
gone. Left denied rather than deleted so an older client build cannot quietly depend on it.

Rehearsed: `emulator/firestore.rules` carries this, and `tests/ownership.rules.test.ts` was
reshaped rather than trimmed. The old cases asked whether the right people get in; the new ones ask
the question that now matters, which is whether a brand new account that IS let in can reach
anything of anyone else's. It cannot: it can create its own documents, cannot create one owned by
someone else, and cannot read or list the owner's. Green at 99, up from 80.

Replace the existing `hpIsHost()` and `hp_config` block with these. Every other block is unchanged:
`hpOwns()`, `hpOwnsNew()` and `hpOwnsEvent()` tighten correctly on their own, because they compose
`hpIsHost()`.

```
// Open signup: anyone signed in with a real account is a host and gets
// their own workspace. There is no allowlist any more.
//
// Safe only because ownerUid scoping shipped first. The allowlist was a
// coarse fence in front of shared data; hpOwns() below is enforced on
// every document, so a brand new account can read exactly nothing of
// anyone else's. This also drops a billed get() from every operation.
//
// Anonymous sign-in is excluded deliberately. It is not enabled on this
// project and must not be: it would hand a throwaway session a workspace.
function hpIsHost() {
  return request.auth != null
    && request.auth.token.firebase.sign_in_provider != 'anonymous';
}

match /hp_config/{docId} {
  // Nothing reads this any more. Left denied rather than deleted so an
  // old client build cannot quietly depend on it.
  allow read, write: if false;
}
```

No index, no backfill. `hp_config/allowlist` can stay in the database as a dead document; deleting
it is optional and changes nothing.

### `hp_feedback`

Written 2026-08-25 for CRM sprint 1 step 4. One new collection, one match block, same owner-scoped
shape as every other `hp_` collection. **No index needed**: the app only ever writes to it.

Testers on the friends-and-family round need a way to say what is missing without leaving the app.
`hp_feedback` is that, and deliberately nothing more: the app writes an entry and never reads one
back. The host reads them in the Firebase console. An inbox, replies, and statuses are a whole
product and none of it is what this round needs.

Owner scoped rather than world-writable so one tester's notes are not readable by another
allowlisted account, which matters precisely because feedback is where someone says something
candid about the product.

Already rehearsed: `emulator/firestore.rules` carries this block, and `hp_feedback` is in the
`COLLECTIONS` list that `tests/ownership.rules.test.ts` parameterises over, so it inherits the full
set of cases. The suite is green at 80, up from 72.

```
// Tester feedback. Written from anywhere in the app, read out of the
// console. Owner scoped like the rest, so one tester's notes are not
// readable by another allowlisted account.
match /hp_feedback/{entryId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}
```

Nothing else changes. No backfill is needed this time: the collection does not exist yet, so there
are no documents predating `ownerUid`.


### Owner scoping on every `hp_` collection, plus `hp_people`

Applied 2026-08-25 through the consumer repo (PR #201, merged as `dbf5b57`) and deployed the same
day. The host platform is multi-tenant in production from this point: being on the allowlist is no
longer enough to read a document, it has to be yours.

**Verified from this repo**, against the consumer repo pinned at `bbba78e`: the applied block
carries `hpIsHost()`, `hpOwns()`, `hpOwnsNew()`, `hpOwnsEvent(eventId)`, owner-scoped blocks on
`hp_orgs`, `hp_events`, `hp_templates`, `hp_contacts`, `hp_availability`, `hp_moments`,
`hp_guestTokens` and the new `hp_people`, all five event subcollections under `hpOwnsEvent`, and
`hp_config` still on a plain `hpIsHost()` read. Normalised for whitespace and comments it is
**identical to `emulator/firestore.rules`**, which is the file `tests/ownership.rules.test.ts`
runs its 72 cases against. What was tested is what shipped.

**Verified elsewhere, not from here:** the deployed ruleset was read back from `novarasocial-dev`
by another session via the Firebase MCP and matches. This repo has no Firebase MCP and no
production credentials, so that is relayed, not first-hand.

**`ownerUid` on the live documents: confirmed.** Read out of production by the consumer-repo
session, which has the credentials for it, using a query **filtered on `ownerUid` equal to the host
uid**. That design is the good part and worth copying: a returned row is itself the evidence that
the field holds that value, rather than a row plus a claim about what was seen in it. All three
documents that existed in production came back:

```
hp_events/uL6u63TveLpkKy8axRs2            ownerUid present, equals the legacy hostUid
hp_orgs/Toa6em6WSYl9DGALhSSg              ownerUid present, equals the legacy createdBy
hp_guestTokens/apkBTBLpZPawNAhtsDKmAHlI   ownerUid present
```

**One claim about that third document does not hold, and the correction matters.** It was reported
as demonstrating that the backfill's token rule, take the owner of the event the token opens rather
than whoever ran the script, executed rather than falling through to the `--owner` fallback. It
cannot demonstrate that. `ownerOfEvent()` returns `ownerUid ?? hostUid ?? owner`, and in this
dataset Jacky owns the event, so all three paths produce the same string. The observation is
consistent with every branch and discriminates between none of them.

So the branch was exercised properly instead, on the emulator, where the answers can differ: plant
an event owned by another uid plus a pre-`ownerUid` token pointing at it, run the backfill with
`--owner` set to Jacky. The token came back owned by the *event's* owner, not by the flag. That is
the branch which breaks first once a second host has events, so it is worth having observed rather
than assumed. Probe documents were removed afterwards.

**The exposure this closed was real, not theoretical.** One of the three backfilled documents was
the Circe org, carrying `"via": "Anna"`. That is a private relationship note, and it was readable
by the second allowlisted account for as long as both UIDs sat on the list. This entry was written
about exactly that field.

**The near miss that justifies the no-rules-from-this-repo rule.** Verified at pinned commits:
`git show 3697132:firebase/firestore.rules | grep -c "match /hp_"` returns 0, and the same at
`f898233` returns 8. The `hp_` blocks were serving production from 2026-08-19, but commit
`b88363f` that captured them sat on an unmerged branch and was not an ancestor of `main`. `main`
carried zero `hp_` blocks from 2026-08-18 until PR #199 merged at 2026-08-24 22:56. For those six
days, `firebase deploy --only firestore` from the consumer repo would have overwritten the live
ruleset with one containing none of the eight, locking the host app out of every collection.

Two process notes that came out of chasing that:

- **Pin the commit.** Record `git rev-parse HEAD` with any finding about another repo. Two checks
  of "main" an hour apart disagreed here, and both were correct for the commit they saw.
- **Two disagreeing checks mean the thing changed at least as often as one was a misread.** This
  entry briefly recorded the near miss as a bad read, with a tidy lesson attached, that
  `git log -S` should be trusted over `grep`. Both halves were false: `log -S` returns nothing at
  `3697132` too, because `b88363f` was not in that history. The tools agreed at both commits. A
  wrong diagnosis dressed as a process improvement is worse than no lesson, because it gets reused.

<details><summary>The block as applied</summary>

Copied out of the consumer repo at `bbba78e`, so this is what is actually deployed rather
than what was proposed.

```
// ── Novara host platform (hp_ collections) ─────────────────────────
//
// Owned by the novara-host repo; blocks applied VERBATIM from its
// docs/pending-rules.md (see CLAUDE.md §Shared Firebase Project).
// Hosts only; guests go through the hpGuest* Cloud Functions with
// the Admin SDK and never hit rules.
//
// 2026-08-25: owner scoping. Until now every allowlisted account could
// read every other host's data, including the private `via` and
// `relationshipTerms` notes on partners. Two UIDs are on the allowlist and
// the guest CRM is about to import 1,233 real people with email addresses.
// Applied only AFTER seed/backfill-owner.mjs stamped `ownerUid` on the
// existing documents — these conditions read that field, so applying them
// first would have locked the host out of her own data. Rehearsed against
// the emulator in novara-host: tests/ownership.rules.test.ts, 72 cases
// green; the same suite scores 33 failures against the hpIsHost()-only
// form this replaces.
function hpIsHost() {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/hp_config/allowlist).data.uids;
}

// On the allowlist AND the document is yours. Read, update and delete test
// the stored document; create tests the incoming one.
function hpOwns() {
  return hpIsHost() && resource.data.ownerUid == request.auth.uid;
}
function hpOwnsNew() {
  return hpIsHost() && request.resource.data.ownerUid == request.auth.uid;
}

// Event subcollections inherit the parent event's owner. Explicit path,
// never a collection-group match: this ruleset is shared with the consumer
// app, and host subcollection names (parties, tasks, runOfShow, crew, log)
// are NOT hp_-prefixed, so a collection-group rule would span both products.
function hpOwnsEvent(eventId) {
  return hpIsHost()
    && get(/databases/$(database)/documents/hp_events/$(eventId)).data.ownerUid == request.auth.uid;
}

match /hp_config/{docId} {
  allow read: if hpIsHost();
  allow write: if false; // allowlist edits happen in the console in M0
}

match /hp_orgs/{orgId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_events/{eventId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();

  match /parties/{partyId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /tasks/{taskId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /runOfShow/{itemId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /crew/{crewId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /log/{entryId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
}

match /hp_templates/{templateId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_contacts/{contactId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_availability/{blockId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_moments/{momentId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_guestTokens/{tokenId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

// New 2026-08-25. The guest CRM: people who attend events, with per-event
// registration history. Host-side only; guests never read or write it.
match /hp_people/{personId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

  }
```

Notes:

- A `list` against any of these now **requires** the query to carry `where('ownerUid', '==', uid)`.
  That is the intended failure mode: an unfiltered list returns permission-denied rather than
  another host's rows. Every `list*` in `firebaseApi` is updated in the same change.
- `hpOwnsEvent()` adds a second billed `get()` per subcollection operation, on top of the one
  `hpIsHost()` already does. Accepted at this scale; the alternative is denormalising `ownerUid`
  onto every task and run-of-show item, which is more places to get wrong.
- `hp_config` deliberately keeps the plain `hpIsHost()` read: the allowlist is shared, not owned.

</details>


### M0 v2 collections, F10 to F13

Applied 2026-08-20 through the consumer repo, verified the same day by reading the deployed ruleset back from the project. `hp_templates`, `hp_availability`, and `hp_moments` are live as top-level blocks, and `crew` is nested inside `hp_events` alongside `parties`, `tasks`, `runOfShow`, and `log`, exactly as asked. No collection-group rule was introduced, and nothing outside the `hp_` section changed.

<details><summary>The block as applied</summary>

The v2 PRD adds templates (F3), host availability and citywide moments (F10), and crew (F13). Crew is a subcollection of `hp_events`, so it needs a nested match block, never a collection-group rule. Paste these **alongside** the M0 host access rules above, and add the `crew` block inside the existing `match /hp_events/{eventId}` block.

```
match /hp_templates/{templateId} {
  allow read, write: if hpIsHost();
}

match /hp_availability/{blockId} {
  allow read, write: if hpIsHost();
}

match /hp_moments/{momentId} {
  allow read, write: if hpIsHost();
}
```

And inside `match /hp_events/{eventId} { ... }`, next to `parties`, `tasks`, `runOfShow`, and `log`:

```
  match /crew/{crewId} {
    allow read, write: if hpIsHost();
  }
```

Notes:

- No composite indexes needed. `hp_guestTokens` is queried with equality filters only (`eventId`, `scope`, `subjectId`), and Firestore merges single-field indexes for equality-only conjunctions. The first composite index would appear the moment one of those queries gains an `orderBy` or a range filter; nothing does today.
- Every subcollection read is a full small collection sorted in memory, deliberately, so no ordering index is required.
- `hp_guestTokens` documents now carry `scope` (`party` | `crew` | `recap`) and `subjectId` instead of a bare `partyId`. Same collection, same rules block, no change needed to the block already pending above.

</details>

### M0 host access rules

Applied 2026-08-19, verified live in the shared ruleset on 2026-08-20 by reading the deployed rules back from the project. The consumer ruleset now carries `hpIsHost()` plus match blocks for `hp_config`, `hp_orgs`, `hp_events` (with `parties`, `tasks`, `runOfShow`, `log`), `hp_guestTokens`, and `hp_contacts`.

<details><summary>The block as applied</summary>

Prerequisite, done 2026-08-18: `hp_config/allowlist` was seeded in the Firebase console with `uids: ["34R2FXCvosRjLh2jS4twZ9csT492"]` (Jacky's UID). Console writes bypass rules, which is what made bootstrapping possible.

Then paste everything below inside `match /databases/{database}/documents { ... }` in the consumer repo's `firestore.rules`, after the existing consumer blocks, and deploy rules from that repo.

```
// Novara host platform (hp_ collections). Hosts only; guests go through
// the hpGuest* Cloud Functions with the Admin SDK and never hit rules.
function hpIsHost() {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/hp_config/allowlist).data.uids;
}

match /hp_config/{docId} {
  allow read: if hpIsHost();
  allow write: if false; // allowlist edits happen in the console in M0
}

match /hp_orgs/{orgId} {
  allow read, write: if hpIsHost();
}

match /hp_events/{eventId} {
  allow read, write: if hpIsHost();

  match /parties/{partyId} {
    allow read, write: if hpIsHost();
  }
  match /tasks/{taskId} {
    allow read, write: if hpIsHost();
  }
  match /runOfShow/{itemId} {
    allow read, write: if hpIsHost();
  }
  match /log/{entryId} {
    allow read, write: if hpIsHost();
  }
}

match /hp_guestTokens/{tokenId} {
  allow read, write: if hpIsHost();
}

match /hp_contacts/{contactId} {
  allow read, write: if hpIsHost();
}
```

Notes:

- `hpIsHost()` does one `get()` per operation, a billed read. Fine at this scale.
- The subcollection blocks are nested inside `hp_events` on purpose: explicit paths, no collection-group matches.
- No composite indexes needed yet. First candidates arrive with the task board queries; they will be added here when the queries are written.

</details>

