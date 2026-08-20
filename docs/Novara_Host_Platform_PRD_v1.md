# Novara host platform, PRD and build roadmap v1

Date: August 18, 2026. Status: ready for build pending section 0 decisions. Working name only; no branding decisions are made in this document.

This document is the build contract for Claude Code and travels together with the strategy doc (`Novara_Host_Platform_Plan_v1.md`), which carries market context, personas, and the full event lifecycle map. Both files go in the repo under `/docs`. Each stays under 25,000 tokens.

---

## 0. Decisions required from Jacky before build starts

1. **Firebase project.** Decided: the existing Novara Firebase project, so auth and future graph integration are shared. Verified August 18, 2026: project ID is `novarasocial-dev`; consumer codebase, rules, and indexes contain zero `hp_` references, so no `hp_` collections exist (this repo's code is the only writer). Consumer functions are Node 20, matching this stack.
2. **Repository.** Decided: a new repo, `novara-host`, never the consumer app repo. Cloud Functions deploy to the same Firebase project using the functions `codebase` feature in firebase.json so existing consumer functions are untouched.
3. **Hosting.** Decided: new Firebase Hosting site on the same project (multi-site hosting), named `novara-host`, target applied in `.firebaserc`. Custom domain later; the wireframes show `hosts.novara.social` as the eventual address. Deploys use `--only hosting:novara-host`.
4. **Host auth.** Decided: Google sign-in with a UID allowlist. Account is jminkler102@gmail.com; UID seeded into `hp_config/allowlist` August 18, 2026.
5. **Scope confirmation.** M0 scope was expanded on August 19, 2026 after discovery pass one (see `Novara_Host_Platform_Discovery_v1.md`): calendar with host availability and citywide moments, recap-lite with corroborated attendance, goals and page governance, crew, rush mode, and holiday checks are in; notifications, file uploads, voice notes, QR card, and any required check-in stay out (details in section 4.6).

## 1. Product context

Co-hosted community events (a host plus co-hosts, sponsors, vendors, and activation partners) are coordinated today across iMessage, Instagram DMs, WhatsApp, spreadsheets, and separate calendars. Existing tools start after the hard decisions: Luma and Partiful are invites, Heylo and WhatsApp are community chat. Nothing covers the multi-party knot of dates, terms, tasks, and day-of logistics.

This product is a coordination workspace for the host, with every other party participating through guest links that require no account. The first user is Jacky, running her own next event with her five existing partners (a hormone-health co-host that also runs demo and testing stations, an event community company, an AI startup sponsor, a coffee truck, and DJs). The build is the validation test: if partners respond through the tool without being chased, the product is real.

Three principles are non-negotiable and shape everything below:

1. **Solo-first.** The tool is fully usable by one person as their own planning checklist. Every participant, party, guest link, and account is optional at every layer; nothing requires sending anything to anyone. Collaboration is an additive layer on a complete single-player product.
2. **Guest links, zero adoption cost, when used.** Partners never need accounts. They tap a link, see only their slice, respond, done.
3. **Do not replace chat.** WhatsApp keeps the conversation. This tool holds decisions, timelines, assignments, and facts.

## 2. Build roadmap overview

- **M0, Event Zero.** The build sprint. Everything needed to plan and run one real event with five partner organizations through the tool. Detailed spec in section 4. Success gate: every party responds through their guest link with at most one logged nudge each, and at least two partners ask to use it for their own events.
- **M1, Memory and proof.** Post-event hardening. Partner recap pages, QR share card for meeting capture, voice notes, standing availability, event templates, deliverables checklists, email nudges, fixes from the Event Zero log. Gate: recaps delivered to all partners within 72 hours of an event; at least one partner shares a recap onward or asks for their own login.
- **M2, Second host and activation.** Multi-host invites, org accounts (event community company pilot), activation module v1 (volunteer shifts, attendee opt-in slots, consent capture, station capture mode). Gate: one org actively planning two or more events without Jacky as host; one activation partner runs a station through the tool.
- **M3, Paid pilot.** First revenue tier switched on (org subscription or activation fee, chosen from M2 evidence), vendor opt-in board, payments and settle-up.

M0 is specified to acceptance-criteria depth. M1 through M3 are directional and will get their own specs after Event Zero.

## 3. Architecture

### 3.1 Stack

- Frontend: React 18 plus Vite, Tailwind CSS, TypeScript, Lucide icons, built directly by Claude Code from the versioned wireframe file (design source of truth) and this PRD. All data flows through a `src/data/api.ts` service seam so mock and Firebase implementations swap without touching components. (Lovable step removed August 19, 2026; `Novara_Host_Platform_Lovable_UI_PRD_v1.md` is superseded, its brand brief evolved into the A.1 system recorded in the wireframe file.)
- Firebase: Auth (Google sign-in), Firestore, Cloud Functions (Node 20), Hosting (new site), Storage (M1, for voice notes and images; not used in M0).
- Amplitude for instrumentation (Browser SDK, `@amplitude/analytics-browser`; Jacky supplies the API key at build time).
- No other services in M0. No email provider until M1.

### 3.2 Access model

**Host:** signs in with Google. Firestore security rules allow read and write on `hp_` collections only for UIDs listed in `hp_config/allowlist`. The host app talks to Firestore directly with the SDK.

**Guests:** never authenticate and never touch Firestore directly. All guest reads and writes go through two HTTP Cloud Functions that validate a capability token:

- `hpGuestView` (GET, `?t={token}`): returns the party-scoped view as JSON: event summary, date options with this party's responses, this party's tasks, run of show (their items plus full schedule), shared links.
- `hpGuestSubmit` (POST, body `{t, action, payload}`): allowed actions are `respond_dates`, `update_task`, `confirm_role`, `add_note`. Validates token, validates the action against the party's scope, writes, returns the refreshed view.

Tokens are 22-plus character random base62 strings, stored as document IDs in `hp_guestTokens` with a `revoked` flag and `lastUsedAt`. Revocation is immediate. No rate limiting in M0 (five trusted partners); note as accepted risk, revisit in M2. Token docs carry a scope: a party workspace, a crew person, or a read-only recap page. `hpGuestView` validates the scope and serves the matching view, so recap sharing and optional crew links reuse this exact mechanism with no new endpoint.

Firestore rules note for the builder: rules cannot wildcard a collection-name prefix, so each `hp_` collection gets an explicit match block with the same allowlist condition. Guest functions use the Admin SDK and bypass rules by design. One cross-product hazard: collection-group rules in the shared ruleset (`match /{path=**}/name/`) span both products' subcollections, and subcollections here (`parties`, `tasks`, `runOfShow`, `crew`) are not `hp_`-prefixed. Never propose a collection-group match block, and if a subcollection name ever needs one, check the consumer repo's subcollection names first (`activity_comments` already has one).

Rules ownership: Firestore rules deploy as one ruleset per project, and the consumer app repo owns `firestore.rules`. This repo's firebase.json contains no firestore section and cannot deploy rules; deploys always use explicit targets for the `hosts` functions codebase and this hosting site. New or changed `hp_` match blocks are written to `docs/pending-rules.md` and surfaced to Jacky, who applies them through the consumer repo. This is deliberate: the one file where a mistake could expose consumer data only ever gets edited in the careful repo.

### 3.3 Data model (Firestore)

All top-level collections are prefixed `hp_`. Verify no collisions with existing consumer collections before first deploy.

```
hp_config/allowlist            { uids: [string] }

hp_orgs/{orgId}
  name: string
  type: "cohost" | "sponsor" | "vendor" | "activation" | "venue"
  contacts: [{ name, role, email?, phone?, instagram?, linkedin? }]
  via: string | null                   // org, host, or event the relationship came through
  relationshipTerms: string            // private host note, e.g. friend rate versus market rate
  notes: string
  createdAt, createdBy

hp_templates/{templateId}              // user data, seeded or user-created; never hardcoded
  ownerUid: string
  name: string
  description: string
  roleSlots: [{ slot, orgType, required: bool }]
  taskSkeleton: [{ title, ownerSlot, offsetDays, note? }]        // negative offsets = days before event
  runOfShowSkeleton: [{ offsetMinutes, title, ownerSlot, notes? }]
  defaults: { capacityTarget?, durationMinutes?, startTime? }
  createdFrom: "seed" | "event" | "blank"
  createdAt

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

F10 to F13 add fields and small collections beyond this sketch (host availability and citywide moments, per-party goals and recap fields, crew people, page governance). The builder defines them following these conventions, keeps them under the `hp_` prefix, and routes every new or changed match block through `docs/pending-rules.md` per section 3.2.

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

**F3. Event workspace.** Create event with title, description, location fields, and a links list (label, URL, owner, draft or final status). Event creation offers "start from a template" using the two seeded playbooks in `Novara_Host_Platform_Event_Templates_v1.md` (DJ morning run, mentor morning run) or blank; picking a template pre-fills role slots, the task skeleton with relative offsets, and the run of show, all of which materialize with real dates when a date option is confirmed. Templates are user data, not application code: they live in `hp_templates` documents owned by the host and are freely editable at the event level after instantiation. The two playbooks enter through a one-time seed script that writes them into Jacky's account at setup; nothing from the playbook doc is hardcoded into the app, and any other host starts with an empty template library plus blank. Overview tab shows status, confirmed date if set, party summary, and open task count. Acceptance: the workspace renders usable on a phone; the host does all real planning here, not in a spreadsheet.

**F2 addendum, relationship provenance.** Org and contact records carry two additional fields: "via" (who the relationship came through: an org, a host, or an event) and a free-text "relationship terms" note (e.g. friend rate versus market rate context). Private to the host, never shown on guest pages.

**F4. Date proposals and responses.** Host defines two to five date options. Each party responds yes, no, or maybe per option through their guest link, plus an optional free-text constraint. Host sees a matrix (parties by options) with response chips. Host confirms one option; all guest pages immediately show a confirmed banner with the final date. Rush mode: templates and task offsets must work on runways as short as two weeks, compressing or dropping tasks whose offsets predate today rather than erroring. Each proposed option is checked against US federal holidays and the host's own calendar entries, with a quiet warning chip on conflicts (the Juneteenth lesson). Acceptance: the matrix makes the best option visually obvious; confirming updates every guest view without republishing links.

**F5. Parties and guest links.** Host adds parties to an event (pick org, set role, write gives and gets). Adding a party generates its token and a shareable URL. Host copies the link and sends it over the channel they already use with that partner (text, DM). Regenerate link revokes the old token. Acceptance: link works in iOS Safari and Android Chrome cold, no account, loads in under two seconds on LTE.

**F6. Task board.** Tasks with title, owner (host or a party), due date, note, status. Host view: grouped by owner, sortable by due date. Guest view: only their tasks, with a done toggle and an optional note. Acceptance: a guest can mark a task done in two taps; the change appears in the host view without refresh gymnastics (simple refetch is fine).

**F7. Run of show.** Ordered timeline items with time, title, owner, notes. Guest view shows two tabs: your items, full schedule. Acceptance: readable at a glance on a phone at 7 am outdoors, which means large type and high contrast.

**F8. Meeting capture, quick-add.** Host-only in M0. A single form: name (required), where met (defaults to the most recent live or upcoming event, changeable), optional handles (Instagram, LinkedIn URL, phone, email), note, follow-up toggle (default on, due in two days). List view shows open follow-ups first; tapping a handle opens the platform link; marking follow-up done clears it. Acceptance: full capture in under 20 seconds one-handed on a phone. No QR card in M0 (that is M1).

**F9. Guest page (cross-cutting).** One page, mobile-first at 390 px, sections: event summary, your role and terms, date options (until confirmed) or confirmed date, your tasks, run of show, shared links. Every action is at most two taps plus confirmation. A small footer states the page is private to the recipient. Acceptance: a partner who has never seen the product completes a date response in under 60 seconds with no instructions.

**F10. Calendar.** Month view per the locked wireframe direction: confirmed events as solid chips, proposed date options as dashed chips carrying response counts (e.g. "Sunrise 4/5"), today marker. Two additions from discovery: host availability, editable away blocks and open-for-events windows rendered as subtle bands; and citywide moments, manually entered name plus date range (SF Tech Week and similar) rendered as banners so planning can be prioritized before anything is concrete. Acceptance: one glance answers "what is confirmed, what is pending, when am I free, and what big weeks are coming."

**F11. Recap-lite and corroborated attendance.** Per-party recap page auto-assembled from what the system already knows (event facts, confirmed date, signup count, links, photo link) plus host-entered fields: actual headcount, and up to three outcome fields per party (leads, tests completed, cups served, hires conversations) echoed against that party's goal. Attendance is corroborated, never gated: host headcount is the baseline, every meeting capture at the event counts as verified presence, and the host can add remembered names to a simple attended list (full roster marking against imported guest lists arrives with M1 lists). Recaps report two honest tiers (attended per host count, verified). Shared by a recap-scoped token link served read-only through the guest view function. There is no required check-in of any kind, ever; free community events must never feel gated. Acceptance: a recap is generatable within 24 hours of an event in under ten minutes of host input.

**F12. Goals, CTA, and page governance.** Each party carries a goal and call-to-action field (the event-level campaign goal lives on the event: app launch, feature promo, hiring). These feed the welcome script context and the recap echo. The event also records page governance: which platform listing is official (Luma, Partiful, other), the listing URL, and which org owns the guest contacts, since assigned hosts on external platforms hold the list. Acceptance: every recap opens with the party's goal and closes with what happened against it.

**F13. Crew.** Lightweight named people who are not orgs (Brad, the boyfriends, helper friends) can be created inline and assigned as owners on tasks and run-of-show items. No accounts; a crew member can optionally receive the same guest link treatment as a party. Acceptance: assigning a run-of-show item to a named person takes two taps.

### 4.3 Instrumentation (Amplitude)

Events: `hp_guest_view_opened` (eventId, role), `hp_date_response_submitted`, `hp_task_updated`, `hp_role_confirmed`, `hp_capture_created`, `hp_followup_done`, `hp_nudge_logged`.

The host UI has a "log nudge" button on each party row. Every time Jacky has to chase a partner outside the tool, she taps it. This is how the success gate ("at most one nudge per party") gets measured honestly.

Also create `hp_events/{eventId}/log` free-text entries (host only) for day-of breakage notes; this is the Event Zero log that drives M1 priorities.

### 4.4 Design system

Direction A.1, locked August 19, 2026, carried in full by the versioned wireframe file. In short: field is the Novara light gray `#F8F7FC` with white surfaces and neutralized borders (`#E9E7F0`); ink `#241F3D`; Poppins for display, Instrument Sans for interface text; violet `#4F3BC9` reserved for meaning (active nav, chips, avatars, proposed-date marks, focus states); the two-stop gradient `#6C4FF0` to `#BB4FD4` at 135 degrees appears only on primary actions. The consumer app's three-stop violet to coral gradient stays retired here. Layout: labeled sidebar that collapses to an icon rail on split-view pages, with the page template map (overview stack, full-width collection, tabbed workspace, canvas, split, focus column, bare guest column) defined in the wireframe file. Guest pages are mobile-first at 390 px; host pages are desktop-comfortable.

### 4.5 Copy rules (hard requirements)

- Never use em dashes anywhere in UI copy, empty states, errors, or emails. Use commas, periods, or colons.
- Sentence case for all headings, buttons, and labels.
- Plain, warm, non-corporate voice. No "engagement" language anywhere.
- Never describe outputs as lists of people. Everything is an activity, a task, or a date.

### 4.6 Non-goals for M0 (do not build)

No partner accounts (guest links only, and even those are optional per the solo-first principle). No chat or messaging. No notifications or emails (the host shares and nudges through existing channels, and logs nudges). No external calendar sync (the native calendar is F10; syncing Google or Apple calendars is M1+). No file uploads (links only). No payments. No required check-in or attendance gating of any kind, ever. No QR share card. No voice notes. No template editor or save-as-template (M1; M0 uses the two seeded templates plus blank). No partner standing-availability profiles beyond per-event responses (host's own availability is in scope via F10). No multi-host support beyond the allowlist. No vendor marketplace. No CRM sync to external systems. No changes of any kind to the consumer app or its collections. Web only.

### 4.7 Editing model and party type profiles

- **Everything the host sees, the host can edit inline.** Solo-first means the host enters and maintains all details herself; guest links only ever layer on top. Every field on events, parties, tasks, run of show, and recaps has an edit state reachable in one or two taps, no separate edit mode pages.
- **Host-recorded responses.** The host can record any date response on behalf of any party (answers that arrived by text or in person). Responses store provenance: answered via link, or recorded by host. The matrix marks the difference subtly; both count the same toward confirmation.
- **Quick edits on tasks and run of show.** Tapping a due date opens a date picker; tapping an owner chip opens a picker listing host, every party, and every crew person; run-of-show times edit the same way. Changing owner or date is never more than two taps plus the selection.
- **Party type profiles.** The org type set is fixed in M0 (cohost, sponsor, vendor, activation, venue) and each type carries built-in default fields: vendor gets rate and terms; sponsor gets budget or in-kind value and goal; cohost gets audience and split notes; activation gets staffing and consent owner; venue gets capacity and permit notes. Values are editable per org and overridable per event, and the host can add custom labeled fields on any org or party. New types are M2.
- **Attendees.** M0 holds signup counts, meeting captures (verified presence), and a remembered-attendees list typed on the recap. Full rosters and imports arrive with M1 lists.
- **Event creation flow.** A short stepped flow: template, basics (title, description, meet and finish points, capacity target), dates (options with holiday and rush checks), parties (optional, picked from the directory), landing in the workspace with the materialized plan fully editable.
- Wireframes v2 carries the visual states for all of the above.

## 5. M1, Memory and proof

- **Sponsor ROI report.** Builds on M0 recap-lite: show rate by audience source (own network versus partner reach versus featured, with observed rates of roughly 62, 27, and 20 percent as priors), a lightweight spend log with in-kind value, and a sponsor-grade shareable artifact. This is the in-kind-to-cash conversion weapon.
- **Save-as-template and template editor.** Any past event saves as a template when a similar one is proposed; templates are user-owned (the platform ships machinery, not content). Editor covers skeletons, offsets, slot fulfillment types and who-pays, modules, and messaging profiles.
- **CRM lists and follow-up hub.** Lists as first-class objects: per-event attendee lists auto-created, app signup lists, newsletter lists, CSV imports. Follow-up hub with the default action being an invite to the next event. Social handles enter via capture and CSV only; no follower or connection APIs exist.
- **QR share card.** Host profile card at a short URL with the host's chosen contact methods; capture with event context attached. Printable for a lanyard.
- **Voice notes on capture.** MediaRecorder to Firebase Storage; playback in the follow-up list; transcription deferred.
- **Talk tracks and quote capture.** Per-event conversation prompts for the day, with a place to capture quotes and feedback tied to contacts.
- **Standing availability (partners).** Aggregate each org's date responses into visible patterns plus editable standing windows and blackout dates. External calendar sync for the host's own calendar lands here too.
- **Deliverables checklists and effort ledger.** Per party, both directions, visible on guest pages; who-does-what agreements recorded so informal asymmetry stays visible.
- **Site profiles and lessons loop.** Venue records accumulating private lessons (wind, power, trash, permit thresholds); recap lessons carry into the next instantiation of the same template. Permit flag raised by amplified sound or size thresholds per site. Shot list with assignments. Date contention warnings when two partners want the same day.
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
5. When ambiguity arises, resolve toward the three principles in section 1 and the non-goals in 4.6, then flag the decision in the build notes rather than expanding scope.
6. Personal content is data, never code. Jacky's templates, partners, contacts, and any real names enter Firestore through a seed script or the UI at setup; the application ships fully generic. If any content seems to need hardcoding, stop and surface it.
