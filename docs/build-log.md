# Build log

Decisions made mid-build and feature ideas parked to protect scope. Newest first.

## 2026-08-25, the four guest exports imported and verified against the emulator

CRM sprint 1, step 2. `seed/import-luma-guests.ts` ran against the emulator on all four brain
repo exports. 1,233 people, 837 signed up, 352 invited only, 44 declined only, 134 with two or
more events: every figure matches the independently built master list exactly. Re-running all
four against the populated store reports zero new people and the same distribution, so the
importer is idempotent against Firestore and not only in memory.

**`seed/link-app-users.ts`** sets `appUserUid` from the confirmed email join in
`master-contacts.csv`. This is the record-to-identity pointer from the partner identity model,
so it links and never copies: nothing about the person's own profile is written into the host's
record. Only the 21 rows whose match type is exactly `email` are linked. The seven
`name-possible` rows stay null, because a wrong guess there silently attributes one person's app
activity to another, which is the "suggested, never automatic" rule applied to a bulk backfill.

With that link in place, all five saved segments from the brain repo reproduce exactly against
`hp_people`: 134 repeat attendees, 817 signed up but not in the app, 352 invited who never came,
290 Lume waitlist yes, 59 superconnectors (Vicki Powell at 16, Julia Barfield at 12). The
superconnector count is a graph query over `referredBy`, which is cheap only because the People
page loads the owner's people once and filters in memory. That was already the recorded decision
for avoiding a composite index; it turns out to be what makes this segment possible at all.

Also verified: importing again **after** linking does not clear `appUserUid`. The importer reads
the stored people before merging, and only host-written fields on a genuinely new person start
blank, so the full-document replace preserves the link rather than undoing it.

## 2026-08-25, multi-tenant foundation verified against the emulator

CRM sprint 1, step 1. The ownership work that was written last session is now proven rather
than argued.

- **The emulator is the test bed, not production.** `seed/admin.mjs` is one Admin SDK handle
  for every seed and import script: with `FIRESTORE_EMULATOR_HOST` set it initializes with no
  credentials at all, otherwise it uses application default credentials. Before this, every
  script called `applicationDefault()` unconditionally and failed on a machine with no service
  account key, which is what had blocked step 0 for a week. Each script now prints which
  database it is about to touch as its first line.
- **`seed/backfill-owner.mjs`**, dry run by default. Walks every top-level `hp_` collection,
  skips documents that already carry `ownerUid`, and copies the legacy owner field
  (`createdBy`, `hostUid`, `capturedBy`) across where one exists. Guest tokens take the owner
  of the event they open rather than whoever ran the script, which is the only answer that
  stays right once a second host has events. Verified on six planted pre-`ownerUid` documents:
  six stamped on the first run, zero on the second.
- **`seed/seed.mjs` was writing `hp_orgs` with no owner at all.** Templates had `ownerUid`,
  orgs did not, so every seeded partner would have been invisible the moment the rules
  tightened. Fixed, and the upsert now matches by name then narrows to this owner, adopting a
  pre-`ownerUid` document rather than duplicating it. Firestore cannot query for a missing
  field, which is why the narrowing happens in memory rather than in the query.
- **`emulator/firestore.rules` now mirrors the block in `docs/pending-rules.md`** exactly,
  ownership conditions and `hp_people` included. The emulator ruleset is the rehearsal for what
  Jacky applies through the consumer repo.
- **Rules tests exist now.** `tests/ownership.rules.test.ts`, 72 cases through
  `@firebase/rules-unit-testing` against the real rules engine: the owner reads and lists its
  own documents in all eight collections, a second allowlisted host cannot read, cannot list
  unfiltered, cannot list by claiming the owner's uid, cannot overwrite, cannot reach a
  subcollection under someone else's event, and cannot plant a document stamped with another
  owner. A non-allowlisted account and a signed-out visitor get nothing. Confirmed meaningful
  by running the same suite against the previous `hpIsHost()`-only ruleset: 33 of the 72 fail.
- **Reverses the 2026-08-25 "rules tests deferred" decision.** That call traded the suite for
  speed and accepted that nothing would catch a later regression. Jacky asked for emulator-backed
  proof of isolation this session, which is the same thing, so the suite got built. The uniform
  `ownerUid` field name stays regardless: it is the right shape either way.

**Content gap, for Jacky.** `seed/content.json` carries three templates and **five** orgs. The
work order says seven. The two missing partners are content, not code, so nothing was invented
to fill the gap. Ten `TODO` markers are still in that file, mostly real names and emails for the
DJ crew and Circe contacts.

## 2026-08-21, sign-in fixed for in-app browsers, and cache headers

A second host opened the link from Messages on iOS and got "Unable to process request due to missing initial state" from the Firebase auth handler. Two causes, both fixed.

- **authDomain was cross-origin.** The app is served from `novara-host.web.app` but `authDomain` was the default `novarasocial-dev.firebaseapp.com`, so sign-in bounced through a third-party origin whose storage the browser partitions. iOS in-app browsers partition aggressively, so the `sessionStorage` the handler wrote was gone on the way back. Firebase Hosting serves `/__/auth/*` on every site (verified 200 on ours, ahead of the SPA catch-all rewrite), so pointing `authDomain` at our own domain makes the whole flow same-origin. Documented in `.env.example` so it survives the next setup. This is per-client config, so the consumer app's own auth is unaffected.
- **Popups do not exist in an iOS in-app browser.** `signInWithPopup` now falls back to `signInWithRedirect` on `popup-blocked`, `operation-not-supported-in-this-environment`, and `web-storage-unsupported`. That fallback is only safe because of the fix above; with a cross-origin authDomain the redirect is exactly what breaks.
- **Hosting served `index.html` with `max-age=3600`**, the Firebase default, so a deploy took up to an hour to reach anyone who had already visited. Everything is now `no-cache`, with a following `/assets/**` rule making the content-hashed bundles `immutable` for a year. Header precedence was verified empirically rather than assumed: with two overlapping rules the later one wins, so the catch-all is listed first. A first attempt used explicit paths and missed the bare `/app`, which is exactly the kind of gap a catch-all avoids. Note the CDN keeps serving already-cached copies with the old header until they expire, so the first hour after this change still needs a cache-busting query or a hard refresh.

## 2026-08-21, second host added to the allowlist

- Added Lisa Tucker (ltucker1117@gmail.com, UID `Fl7zJ2xfssSyQQ6sMXILesw7N7D2`) to `hp_config/allowlist`, alongside Jacky. Appended rather than replaced, and read back to confirm both UIDs are present: clobbering that array would lock everyone out of the app with no way back in, because `hp_config` is `allow write: if false` by design.
- A UID only exists once that person has signed in with Google at least once, so the order is always: they sign in, the denied screen shows them their UID, then it goes on the list. Lisa had already signed in, so hers was available to look up by email.
- **The allowlist is all or nothing in M0.** Everyone on it can read and write every `hp_` collection: all events, the whole partner directory including the private `via` and `relationshipTerms` notes, and every captured contact. Per-host scoping is M2 (PRD section 6), so there is no way to grant a narrower slice today.

## 2026-08-20, F10 to F13 rules applied, M0 fully live

- The second rules block went in through the consumer repo. Verified by reading the deployed ruleset back: `hp_templates`, `hp_availability`, and `hp_moments` are live, and `crew` is correctly nested inside `hp_events` rather than added as a collection-group rule. Nothing outside the `hp_` section changed. `docs/pending-rules.md` now has an empty Pending section for the first time.
- No redeploy was needed. Rules take effect immediately, and every commit after the deploy was documentation only, so the build at https://novara-host.web.app already matches main.
- M0 is now fully functional in production: templates, calendar away blocks and citywide moments, and crew assignment all have their rules.

## 2026-08-20, first production deploy

- Deployed `firebase deploy --only functions:hosts,hosting:novara-host`. Live at https://novara-host.web.app. `hpGuestView` and `hpGuestSubmit` created as Node 20 2nd gen functions in us-central1; consumer functions and the other three hosting sites untouched, which is what the explicit targets buy.
- Smoke tested in production: hosting serves 200, the `/g/:token` deep link serves index.html through the SPA rewrite, and `/api/guest/view` reaches the function unauthenticated and returns `invalid_token` for a bad token. Public invoker was granted without an org policy fight, so guest links work for people with no account.
- No custom domain yet. `novara-host.web.app` is already in the Auth authorized domains. The wireframes call the eventual address `hosts.novara.social` (plural); confirm the exact subdomain before DNS, because it also has to be added to authorized domains or Google sign-in breaks on it.
- **Deployed ahead of the second rules block on purpose**, so the URL is live while the consumer repo applies it. Until it lands, templates, calendar away blocks and moments, and crew assignment fail with permission denied. Everything else works. Handoff text for the consumer repo is in `docs/rules-handoff.md`.
- **Runtime deadline:** the CLI warned that Node 20 was deprecated 2026-04-30 and is decommissioned **2026-10-30**, after which these functions cannot be redeployed without a runtime bump. Roughly two months from this deploy. PRD 3.1 pinned Node 20 to match the consumer functions, so moving to 22 is worth checking against that repo first.

## 2026-08-19, PRD v2 and the M0 build (F1 to F13)

Inputs: an updated PRD (three principles, F10 to F13, section 4.7) and wireframes v2, which is now the design source of truth at `docs/novara-hosts-wireframes-v2.html`.

**PRD reconciliation.** The updated PRD arrived with section 0 decisions 1 to 3 reverted to their pre-verification wording, and had dropped the collection-group hazard note from 3.2. Merged forward instead of overwriting: kept the new substance, restored the verified project ID, repo name, hosting target, sign-in account, and the collection-group warning. If a v3 arrives, check those five paragraphs first.

**Missing companion doc.** PRD F3 references `Novara_Host_Platform_Event_Templates_v1.md` for the two seeded playbooks (DJ morning run, mentor morning run). That file was not supplied and is not in the repo. Per build guardrail 6 the content is data, not code, so the machinery shipped without it: `seed/seed.mjs` plus `seed/content.example.json` write templates and partners into Firestore from a gitignored `seed/content.json`. The mock fixture carries plausible generic skeletons under those two names purely for offline dev. **Jacky: paste the real playbooks into `seed/content.json` and run the seed script.** `Novara_Host_Platform_Discovery_v1.md` is also referenced and absent, but nothing depends on it.

**Architecture.**

- Frontend converted to TypeScript. Every read and write goes through the `src/data/api.ts` seam; components never import `firebase/firestore`. Two implementations behind it: `mockApi` (in memory, localStorage backed) and `firebaseApi`.
- `npm run dev:mock` runs the whole host app and guest pages with no Firebase at all. This is how the 21 wireframe screens were checked, and it is the fastest loop for UI work.
- `getEventBundle` loads the event plus every subcollection in one call, so the workspace is one round trip and all five tabs share it. Every write refetches the bundle.

**Deviations from the PRD data sketch, all deliberate.**

- `dateResponses` stores `{ value, source, note, at }` rather than a bare string, because 4.7 requires host-recorded answers to carry provenance. Both sources count the same toward confirming; the matrix marks the difference with a small dot.
- Task and run-of-show owners are prefixed refs (`host`, `all`, `party:{id}`, `crew:{id}`) rather than `ownerPartyId`. PRD 3.3 predates crew; once F13 exists one field has to address four kinds of owner.
- Crew is a subcollection of the event, not a top-level collection. Reuse across events is an M1 question; per-event matches "created inline" and costs one nested match block.
- Events carry `hostDisplayName`, denormalised, so guest pages can say who invited them without an auth lookup inside the function.
- Routes use `/app/partners`, not the `/app/orgs` in PRD 3.4, because the wireframes say partners everywhere. `/app/orgs` redirects.
- One guest route (`/g/:token`) serves party, crew, and recap views. The token's scope decides which, which is exactly what PRD 3.2 means by reusing the mechanism with no new endpoint.

**Rush mode.** The whole pre-event offset range scales together onto the days actually remaining, rather than clamping individual tasks. Clamping was tried first and reordered tasks: a T-21 task landed after a T-14 one. Verified on a 15 day runway: T-35 lands today, the sequence holds, positive offsets stay untouched.

**Guest page weight.** The Amplitude SDK is about 220 kB, which was more than the rest of the guest page put together and sat in its critical path. `track()` now imports it on demand. Guest critical path is roughly 190 kB raw, 63 kB gzipped, and Firebase never enters it because the host branch is lazy.

**Bug worth remembering.** `clone(undefined)` in the mock API threw on every void-returning write, after the write had already persisted. Writes appeared to work while never triggering their refetch, and the error surfaced only as "unknown" because the handler read `err.code` and mock errors carry `message`. Both fixed. Error handlers now fall back to `message` and log to the console.

**Parked, not built.** Save-as-template and the template editor stay M1 per 4.6. Drag to reorder the run of show is not built; items sort by time, which covers the real case. No external calendar sync. Deleting a partner still leaves a dangling `orgId` on any event that used them; guest and host views render it as "removed partner" rather than breaking.

**Rules.** `hp_templates`, `hp_availability`, `hp_moments`, and the `crew` subcollection all need match blocks. Exact text is in `docs/pending-rules.md` and mirrored in `emulator/firestore.rules`. No composite indexes needed: `hp_guestTokens` is queried with equality filters only, and Firestore merges single-field indexes for those. **Nothing works in production until Jacky applies both pending blocks through the consumer repo.**

## 2026-08-18, prod bootstrap

- Google sign-in confirmed already enabled on the shared project (Jacky's first sign-in just worked).
- Seeded `hp_config/allowlist` in the Firebase console with Jacky's UID `34R2FXCvosRjLh2jS4twZ9csT492`. First `hp_` collection in the shared database.
- Added `novara-host.web.app` to Firebase Auth authorized domains ahead of the first deploy.
- Remaining before host access works in prod: apply the M0 rules block from docs/pending-rules.md through the consumer repo.

## 2026-08-18, F2 partner directory and emulator harness

- Partner directory CRUD shipped and verified end to end in the browser: create with two contacts, edit, delete, empty and error states.
- Emulator harness added: `firebase.emulators.json` plus `emulator/firestore.rules`, running against the offline project `demo-novara-host`. The rules file mirrors docs/pending-rules.md so the exact block Jacky applies got tested for real: reads deny before the allowlist doc exists, and a seeded UID unlocks reads and writes. Sign-in uses redirect instead of popup in emulator mode only, because the test browser blocks popups.
- Deleting an org that is a party on an event will leave a dangling orgId. Allowed in M0 (five known partners, low risk); guest views should render a removed partner gracefully. Revisit at M1.
- window.confirm for the delete confirmation: boring and fine for M0.

## 2026-08-18, F1 host shell and auth

- Sign-in account confirmed: jminkler102@gmail.com (PRD section 0, decision 4).
- Client treats permission-denied on the allowlist read as "not a host" rather than an error, because rules deny allowlist reads to anyone not on it. Real enforcement lives in rules; the client check is UX.
- hp_config writes are `allow write: if false` in M0: allowlist edits happen in the console, and console writes bypass rules. Revisit at M2 when multi-host invites replace the allowlist.
- Route branches are lazy-loaded so the guest chunk stays free of Firebase and host code.
- Reminder for first production deploy: add novara-host.web.app to Firebase Auth authorized domains, or sign-in will only work on localhost.

## 2026-08-18, repo setup

- Scaffolded: Vite plus React 18 plus Tailwind 4 app with the two route trees (`/app/*` host, `/g/:token` guest), functions codebase `hosts` on Node 20 with 501 stubs for `hpGuestView` and `hpGuestSubmit`, design tokens in `src/index.css`.
- firebase.json has no firestore section on purpose, and hosting rewrites `/api/guest/view` and `/api/guest/submit` to the two functions so guest pages call same-origin URLs with no CORS setup.
- Frontend is plain JSX, functions are TypeScript. Kept the guest bundle concern in mind: guest route should get code-split via lazy import when M0 builds it out.
- No deploys yet. First deploy happens during M0 once there is something real to ship.
