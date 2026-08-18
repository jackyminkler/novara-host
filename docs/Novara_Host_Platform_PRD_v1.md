# Novara host platform, PRD and build roadmap v1

Date: August 18, 2026. Status: ready for build pending section 0 decisions. Working name only; no branding decisions are made in this document.

This document is the build contract for Claude Code and travels together with the strategy doc (`Novara_Host_Platform_Plan_v1.md`), which carries market context, personas, and the full event lifecycle map. Both files go in the repo under `/docs`. Each stays under 25,000 tokens.

---

## 0. Decisions required from Jacky before build starts

1. **Firebase project.** Recommended: the existing Novara Firebase project, so auth and future graph integration are shared. Verified August 18, 2026: project ID is `novarasocial-dev`; consumer codebase, rules, and indexes contain zero `hp_` references, so no `hp_` collections exist (this repo's code is the only writer). Consumer functions are Node 20, matching this stack. Alternative: a separate project, at the cost of a future migration.
2. **Repository.** Decided: a new repo, `novara-host`, never the consumer app repo. Cloud Functions deploy to the same Firebase project using the functions `codebase` feature in firebase.json so existing consumer functions are untouched.
3. **Hosting.** New Firebase Hosting site on the same project (multi-site hosting), named `novara-host` (site IDs are globally unique across all of Firebase; if taken, fall back to `novarasocial-host` to match the project's existing `novarasocial-*` sites). Custom domain later. One-time setup from this repo: `firebase hosting:sites:create novara-host` then `firebase target:apply hosting novara-host novara-host`, so deploys can use `--only hosting:novara-host`.
4. **Host auth.** Recommended: Google sign-in with a UID allowlist. Confirm which Google account Jacky will use.
5. **Scope confirmation.** M0 ships with no notifications, no file uploads, no voice notes, no recap pages. Confirm these cuts (details in section 4.6).

## 1. Product context

Co-hosted community events (a host plus co-hosts, sponsors, vendors, and activation partners) are coordinated today across iMessage, Instagram DMs, WhatsApp, spreadsheets, and separate calendars. Existing tools start after the hard decisions: Luma and Partiful are invites, Heylo and WhatsApp are community chat. Nothing covers the multi-party knot of dates, terms, tasks, and day-of logistics.

This product is a coordination workspace for the host, with every other party participating through guest links that require no account. The first user is Jacky, running her own next event with her five existing partners (a hormone-health co-host that also runs demo and testing stations, an event community company, an AI startup sponsor, a coffee truck, and DJs). The build is the validation test: if partners respond through the tool without being chased, the product is real.

Two principles are non-negotiable and shape everything below:

1. **Guest links, zero adoption cost.** Only the host has an account. Partners tap a link, see only their slice, respond, done.
2. **Do not replace chat.** WhatsApp keeps the conversation. This tool holds decisions, timelines, assignments, and facts.

## 2. Build roadmap overview

- **M0, Event Zero.** The build sprint. Everything needed to plan and run one real event with five partner organizations through the tool. Detailed spec in section 4. Success gate: every party responds through their guest link with at most one logged nudge each, and at least two partners ask to use it for their own events.
- **M1, Memory and proof.** Post-event hardening. Partner recap pages, QR share card for meeting capture, voice notes, standing availability, event templates, deliverables checklists, email nudges, fixes from the Event Zero log. Gate: recaps delivered to all partners within 72 hours of an event; at least one partner shares a recap onward or asks for their own login.
- **M2, Second host and activation.** Multi-host invites, org accounts (event community company pilot), activation module v1 (volunteer shifts, attendee opt-in slots, consent capture, station capture mode). Gate: one org actively planning two or more events without Jacky as host; one activation partner runs a station through the tool.
- **M3, Paid pilot.** First revenue tier switched on (org subscription or activation fee, chosen from M2 evidence), vendor opt-in board, payments and settle-up.

M0 is specified to acceptance-criteria depth. M1 through M3 are directional and will get their own specs after Event Zero.

## 3. Architecture

### 3.1 Stack

- React 18 plus Vite, Tailwind CSS, Lucide icons. Single-page app with two route trees (host and guest).
- Firebase: Auth (Google sign-in), Firestore, Cloud Functions (Node 20), Hosting (new site), Storage (M1, for voice notes and images; not used in M0).
- Amplitude for instrumentation (Browser SDK, `@amplitude/analytics-browser`; Jacky supplies the API key at build time).
- No other services in M0. No email provider until M1.

### 3.2 Access model

**Host:** signs in with Google. Firestore security rules allow read and write on `hp_` collections only for UIDs listed in `hp_config/allowlist`. The host app talks to Firestore directly with the SDK.

**Guests:** never authenticate and never touch Firestore directly. All guest reads and writes go through two HTTP Cloud Functions that validate a capability token:

- `hpGuestView` (GET, `?t={token}`): returns the party-scoped view as JSON: event summary, date options with this party's responses, this party's tasks, run of show (their items plus full schedule), shared links.
- `hpGuestSubmit` (POST, body `{t, action, payload}`): allowed actions are `respond_dates`, `update_task`, `confirm_role`, `add_note`. Validates token, validates the action against the party's scope, writes, returns the refreshed view.

Tokens are 22-plus character random base62 strings, stored as document IDs in `hp_guestTokens` with a `revoked` flag and `lastUsedAt`. Revocation is immediate. No rate limiting in M0 (five trusted partners); note as accepted risk, revisit in M2.

Firestore rules note for the builder: rules cannot wildcard a collection-name prefix, so each `hp_` collection gets an explicit match block with the same allowlist condition. Guest functions use the Admin SDK and bypass rules by design. One cross-product hazard: collection-group rules in the shared ruleset (`match /{path=**}/name/`) span both products' subcollections, and subcollections here (`parties`, `tasks`, `runOfShow`) are not `hp_`-prefixed. Never propose a collection-group match block, and if a subcollection name ever needs one, check the consumer repo's subcollection names first (`activity_comments` already has one).

Rules ownership: Firestore rules deploy as one ruleset per project, and the consumer app repo owns `firestore.rules`. This repo's firebase.json contains no firestore section and cannot deploy rules; deploys always use explicit targets for the `hosts` functions codebase and this hosting site. New or changed `hp_` match blocks are written to `docs/pending-rules.md` and surfaced to Jacky, who applies them through the consumer repo. This is deliberate: the one file where a mistake could expose consumer data only ever gets edited in the careful repo.

### 3.3 Data model (Firestore)

All top-level collections are prefixed `hp_`. Verify no collisions with existing consumer collections before first deploy.

```
hp_config/allowlist            { uids: [string] }

hp_orgs/{orgId}
  name: string
  type: "cohost" | "sponsor" | "vendor" | "activation" | "venue"
  contacts: [{ name, role, email?, phone?, instagram?, linkedin? }]
  notes: string
  createdAt, createdBy

hp_events/{eventId}
  title: string
  status: "draft" | "planning" | "confirmed" | "live" | "wrapped"
  description: string
  dateOptions: [{ id, startsAt (ISO), label }]        // 2 to 5 options
  confirmedDateOptionId: string | null
  location: { name, meetPoint, finishPoint, notes }
  links: [{ label, url, ownerPartyId | "host", status: "draft" | "final" }]
  hostUid: string
  createdAt

hp_events/{eventId}/parties/{partyId}
  orgId: string
  roleOnEvent: "cohost" | "sponsor" | "vendor" | "activation"
  status: "invited" | "confirmed" | "declined"
  terms: { gives: string, gets: string }              // free text in M0
  dateResponses: { [optionId]: "yes" | "no" | "maybe" }
  constraintNote: string                               // free text from guest
  tokenId: string

hp_events/{eventId}/tasks/{taskId}
  title: string
  ownerPartyId: string | "host"
  dueDate: ISO | null
  status: "open" | "done"
  note: string
  order: number

hp_events/{eventId}/runOfShow/{itemId}
  time: string          // "07:30"
  title: string
  ownerPartyId: string | "host" | "all"
  notes: string
  order: number

hp_guestTokens/{token}
  eventId, partyId, revoked: bool, createdAt, lastUsedAt

hp_contacts/{contactId}                                // meeting capture
  name: string
  handles: { instagram?, linkedin?, phone?, email? }
  eventId: string | null                               // context, defaulted
  note: string
  followUp: { due: ISO, done: bool } | null
  capturedAt, capturedBy
```

### 3.4 Routes

Host (auth required):

- `/app` events list plus capture quick-access
- `/app/orgs` partner directory
- `/app/events/{id}` event workspace (tabs: overview, dates, parties, tasks, run of show)
- `/app/capture` meeting capture quick-add and follow-up list

Guest (token, no auth):

- `/g/{token}` single mobile-first page rendering the party-scoped view with inline actions

## 4. M0, Event Zero: detailed spec

### 4.1 Goal

Plan and run one real Novara event end to end through the tool, with all five partner organizations participating via guest links. Measure the success gate honestly through instrumentation, not memory.

### 4.2 Features

**F1. Host shell and auth.** Google sign-in; allowlist check; signed-out users see a plain sign-in page. Acceptance: a non-allowlisted Google account cannot read or write anything.

**F2. Partner directory.** CRUD for orgs and their contacts. Seed the five real partners on day one. Acceptance: creating an org with two contacts takes under one minute.

**F3. Event workspace.** Create event with title, description, location fields, and a links list (label, URL, owner, draft or final status). Overview tab shows status, confirmed date if set, party summary, and open task count. Acceptance: the workspace renders usable on a phone; the host does all real planning here, not in a spreadsheet.

**F4. Date proposals and responses.** Host defines two to five date options. Each party responds yes, no, or maybe per option through their guest link, plus an optional free-text constraint. Host sees a matrix (parties by options) with response chips. Host confirms one option; all guest pages immediately show a confirmed banner with the final date. Acceptance: the matrix makes the best option visually obvious; confirming updates every guest view without republishing links.

**F5. Parties and guest links.** Host adds parties to an event (pick org, set role, write gives and gets). Adding a party generates its token and a shareable URL. Host copies the link and sends it over the channel they already use with that partner (text, DM). Regenerate link revokes the old token. Acceptance: link works in iOS Safari and Android Chrome cold, no account, loads in under two seconds on LTE.

**F6. Task board.** Tasks with title, owner (host or a party), due date, note, status. Host view: grouped by owner, sortable by due date. Guest view: only their tasks, with a done toggle and an optional note. Acceptance: a guest can mark a task done in two taps; the change appears in the host view without refresh gymnastics (simple refetch is fine).

**F7. Run of show.** Ordered timeline items with time, title, owner, notes. Guest view shows two tabs: your items, full schedule. Acceptance: readable at a glance on a phone at 7 am outdoors, which means large type and high contrast.

**F8. Meeting capture, quick-add.** Host-only in M0. A single form: name (required), where met (defaults to the most recent live or upcoming event, changeable), optional handles (Instagram, LinkedIn URL, phone, email), note, follow-up toggle (default on, due in two days). List view shows open follow-ups first; tapping a handle opens the platform link; marking follow-up done clears it. Acceptance: full capture in under 20 seconds one-handed on a phone. No QR card in M0 (that is M1).

**F9. Guest page (cross-cutting).** One page, mobile-first at 390 px, sections: event summary, your role and terms, date options (until confirmed) or confirmed date, your tasks, run of show, shared links. Every action is at most two taps plus confirmation. A small footer states the page is private to the recipient. Acceptance: a partner who has never seen the product completes a date response in under 60 seconds with no instructions.

### 4.3 Instrumentation (Amplitude)

Events: `hp_guest_view_opened` (eventId, role), `hp_date_response_submitted`, `hp_task_updated`, `hp_role_confirmed`, `hp_capture_created`, `hp_followup_done`, `hp_nudge_logged`.

The host UI has a "log nudge" button on each party row. Every time Jacky has to chase a partner outside the tool, she taps it. This is how the success gate ("at most one nudge per party") gets measured honestly.

Also create `hp_events/{eventId}/log` free-text entries (host only) for day-of breakage notes; this is the Event Zero log that drives M1 priorities.

### 4.4 Design system

- Font: Poppins (400, 500, 600, 700).
- Background `#FAFAFE`, base text and headings dark navy `#1A1A2E`, white cards with subtle borders.
- Primary actions and accents: 135 degree gradient, violet `#7B5AFF` to magenta `#C45ADB` to coral `#FF6B8A`. Use sparingly; this is a productivity surface, not a marketing page.
- Icons: Lucide only.
- Guest pages are designed mobile-first; host pages are responsive but desktop-comfortable.

### 4.5 Copy rules (hard requirements)

- Never use em dashes anywhere in UI copy, empty states, errors, or emails. Use commas, periods, or colons.
- Sentence case for all headings, buttons, and labels.
- Plain, warm, non-corporate voice. No "engagement" language anywhere.
- Never describe outputs as lists of people. Everything is an activity, a task, or a date.

### 4.6 Non-goals for M0 (do not build)

No partner accounts. No chat or messaging. No notifications or emails (the host shares and nudges through existing channels, and logs nudges). No calendar integrations. No file uploads (links only). No payments. No recap pages. No QR share card. No voice notes. No availability profiles beyond per-event responses. No multi-host support beyond the allowlist. No vendor marketplace. No changes of any kind to the consumer app or its collections. Web only.

## 5. M1, Memory and proof

- **Recap pages.** Per-party page assembled from event data plus host-entered outcomes (attendance actual, photos link, per-party outcome fields such as leads or tests completed or cups served), shared by token link. Target: generated and sent within 72 hours of the event.
- **QR share card.** Host profile card at a short URL with the host's chosen contact methods; scanning or opening it lets the other person save details and lets the host capture them with event context attached. Printable version for a lanyard.
- **Voice notes on capture.** MediaRecorder to Firebase Storage; playback in the follow-up list; transcription deferred.
- **Standing availability.** Aggregate each org's date responses into visible patterns (never does Mondays, needs three weeks lead) plus editable standing windows and blackout dates.
- **Templates and cloning.** Clone a wrapped event into a new draft with parties, tasks, and run of show carried over, dates cleared.
- **Deliverables checklists.** Per party, both directions (what they owe, what the host owes them), visible on guest pages.
- **Email nudges.** Transactional email provider decision made here, not in M0.
- Fixes from the Event Zero log take priority over all of the above.

## 6. M2, Second host and activation

- Multi-host: invite flow replaces the allowlist; each host sees only their own events and directory, with org records shareable later.
- Org accounts: an organization entity with multiple host users, a season calendar across events, and a shared partner directory. Pilot with the event community company as design partner.
- Activation module v1: volunteer shifts, attendee opt-in time slots, consent text capture with timestamp, and station capture mode (rapid capture UI for booth staff, CSV export, consent recorded before capture). Pilot with the hormone-health partner. Their regulatory and consent obligations remain theirs; the platform records consent and schedules, nothing more.
- Pricing conversations begin here, informed by real usage, with two candidate models: org subscription and activation fee.

## 7. M3, Paid pilot

First paid tier switched on based on M2 evidence. Vendor opt-in board (vendors browse upcoming events needing their category and raise a hand). Payments and settle-up. Consumer bridge work (opt-in attendee supply; attendee-to-attendee capture ships in the consumer app, not here).

## 8. Build guardrails for Claude Code

1. Never modify the consumer app repo, its Cloud Functions, or any non-`hp_` Firestore collection. If a change there seems necessary, stop and surface it.
2. Keep the guest page dependency-light and fast; it is the product's first impression for every partner.
3. Prefer boring solutions: simple refetch over realtime listeners where either works, one HTTP function with an action switch over many endpoints.
4. Every UI string passes the copy rules in 4.5. Add a check to the definition of done for each feature.
5. When ambiguity arises, resolve toward the two principles in section 1 and the non-goals in 4.6, then flag the decision in the build notes rather than expanding scope.
