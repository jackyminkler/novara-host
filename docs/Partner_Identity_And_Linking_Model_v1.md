# Partner identity and linking model v1

**Date:** 2026-08-24. **Repo:** novara-host. **Status:** Design decision, pre-schema. Supersedes the "claim this profile" framing floated on 2026-08-24.

This is decision-first: the model and why, not a final schema. It governs how host-created partner/guest records relate to real accounts as the app goes multi-tenant.

## The core decision: two object types, not one

A record you keep *about* someone is a different thing from the profile that person owns *about themselves*. Conflating them ("claim this profile") breaks the moment more than one host knows the same partner, or one host keeps private notes. So the model has two distinct objects:

**1. The record you create (host-owned).** Your private entry about a partner or guest: the contact info you typed, your private notes, your tags, the terms of the deal *you* struck. Invisible to the partner, to the public, and to every other host. Many of these can exist for one real person (ten hosts can each have their own record of the same DJ). In this repo, `hp_orgs` already is this for partners, and `hp_people` (Guest CRM plan) is this for guests.

**2. The verified identity (self-owned).** When the real person creates an account, they own their canonical profile: name, current photo, handles, verified email/phone. Only they can edit it. No host's notes ever flow into it; they never see anyone's notes about them. For a guest, this identity is their consumer-app `users` doc. For a partner, it is their future host/partner account.

## They connect by a link, not a copy

The host record carries a **nullable pointer** to a verified identity (`linkedIdentityUid` / `appUserUid`). While null, the record is just your private entry with whatever contact details you typed. When set, the identity's self-maintained fields (photo, current handle, verified contact) **render** in your view while your notes stay yours.

A link, not a copy, on purpose: a copied contact card goes stale the day they change their photo or handle; a link stays live. You get freshness without owning their identity.

Consequences that fall out for free:
- **Private notes are structurally private.** They live on your record, never on the identity, so linking a real account to your record exposes none of your notes. The boundary is the data model, not a per-field setting.
- **Many-to-one is native.** N host records → 1 identity. Each host links independently; nobody's record merges into anyone else's.
- **The precedent already exists.** `hp_people.appUserUid` (Guest CRM plan) is exactly this pattern: your private guest record with a nullable pointer to the person's verified consumer-app account. Partners get the same treatment; it's one rule applied twice.

## The connect-and-notify flow (replaces "claim")

When any new account is created, a server-side function (Admin SDK, so it is privacy-safe) checks whether any host already holds a record whose email, phone, or handle matches the new account. Each host who does gets a suggestion: "Ragnar, the DJ you added, just joined Novara — connect your record to his profile?" The host confirms; the link is set.

Rules for this flow:
- **Suggested and confirmable, never automatic.** The system proposes a link; the host accepts. No silent overwrite of host-entered data.
- **Privacy-safe by construction.** The matcher only ever tells a host about a person that host *already had a record for*. It never surfaces a new user to hosts who did not already hold their contact. You already had their email; we are only telling you they are now reachable in-app.
- **Many independent notifications.** All ten hosts who had a record for the same DJ get their own suggestion; each links their own record.

## UI: a verified mark

Show a small "verified" indicator when a record is linked to a real account, and plain when it is just your private entry. That badge is the visible difference between "someone I typed in" and "someone who is really here," and it is what makes the partner graph feel alive as nodes get claimed by their real owners over time.

## Sharing on co-hosted events is a separate layer

Linking a record to an identity is about *identity freshness*. It is NOT what grants a co-host access to a shared event. Event sharing is its own per-event grant (see the multi-tenancy work order): a co-host sees the guest list, vendors, and run-of-show of the *events you co-hosted with them*, enforced by a denormalized `memberUids` array on the event, and never your other events or your global CRM. Keep the two concepts distinct: identity link ≠ data-access grant.

## What this changes downstream

- Guest CRM plan: `hp_people.appUserUid` stays as specified; this doc is the general statement of that pattern. No change needed there beyond citing this doc.
- `hp_orgs`: gains a nullable `linkedIdentityUid`, keeps its private `relationshipTerms`/`notes` (already present) as owner-only. The connect-and-notify matcher is a later phase; the nullable field can land now so no migration is needed later.
- Security: every link and every share is rule-enforced (owner-only records; `memberUids` for shares), and covered by the rules tests in the security guardrail. The matcher runs server-side only.
