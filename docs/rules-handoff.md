# Handoff: add four rules blocks for the host platform

Paste everything below to whoever edits `firestore.rules` in the consumer app repo.

---

Please add four security-rules blocks to `firestore.rules` for the Novara host
platform. The host platform shares this Firebase project (`novarasocial-dev`)
and owns only collections prefixed `hp_`. It cannot deploy rules itself by
design, so this repo is the only place these can be applied.

**Context: a previous batch of `hp_` blocks is already live in this ruleset.**
Find the section that begins with the comment `── Novara host platform (hp_
collections) ──` and the `hpIsHost()` function. Everything below goes in that
same section and reuses that same `hpIsHost()` helper. Do not redefine it.

**1. Three new top-level collections.** Add these next to the existing
`hp_orgs` / `hp_guestTokens` / `hp_contacts` blocks:

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

**2. One new subcollection.** Inside the existing `match /hp_events/{eventId}`
block there are already nested blocks for `parties`, `tasks`, `runOfShow`, and
`log`. Add a fifth one alongside them:

```
  match /crew/{crewId} {
    allow read, write: if hpIsHost();
  }
```

Then deploy rules from this repo as normal.

## Two things to be careful about

- **Never use a collection-group rule for these.** A block like
  `match /{path=**}/crew/{id}` would span both products' subcollections in this
  shared ruleset. `crew` must stay explicitly nested inside `hp_events`, exactly
  like `parties` and `tasks` already are.
- **Do not change anything outside the `hp_` section.** No consumer collections
  are involved in this change.

No composite indexes are needed. Nothing else in the ruleset should change.
