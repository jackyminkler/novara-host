# Build log

Decisions made mid-build and feature ideas parked to protect scope. Newest first.

## 2026-08-26, partner calendars, template shapes, and the group huddle

The rest of the multi-party list, in one pass. Push notifications were floated and withdrawn
mid-session, so expiry ships with a reset button and no reminder.

**Two scopes, two audiences, and that is the whole unlock.** The host requests sensitive scopes
and pays for them: an unverified app screen, and one of the project's 100 lifetime
unapproved-sensitive grants. A guest requests `calendar.freebusy`, which Google treats as
non-sensitive, so there is no warning screen, no verification, and no cap however many people use
it. That is what makes "everyone drop your calendar into this link" work at any size while the
host flow stays gated. `src/lib/googleIdentity.ts` is now the shared token layer; the two callers
differ only in which scope string they ask for.

**freebusy is also the right privacy answer, not a compromise.** It returns start and end pairs
and nothing else. There is no version of the group flow that leaks what anyone is doing, because
the API never had it to give.

**A partner answering dates from their calendar reuses `respond_dates`.** No new action, no new
endpoint. The only addition is a `calendar` value on `ResponseSource`, so the matrix can mark an
answer that was read rather than decided. It counts the same toward confirming a date.

**Weekday filtering is asked for, not inferred.** The first attempt tried to read a template's
preferred weekdays from its task offsets, which cannot work: offsets are relative to the event, so
they say nothing about which day it lands on. That function was deleted rather than left returning
an empty list with a confident name. Both the event dates step and the huddle now carry weekday
chips, which is what answers "the next three Saturdays".

**A template's start time is a preference, not a filter.** A sunrise template wants 7am, but a
Saturday only open from 9 is still a better answer than no answer. Suggestions fall back to the
window's own start and rank below true matches, and the chip says "later than usual" rather than
silently shifting the time.

**The huddle computes its own ranking in the browser.** Every participant's free time is already
in the view, so ranking locally avoids a second copy of `suggest` in the functions build root.
That is the same drift that forces `guestTypes.ts` to exist twice, and one copy of it is enough.

**One vote each, and it moves.** A tally where somebody voted for everything is not a tally.
Joining twice replaces rather than duplicates, so re-reading a calendar after moving a meeting
updates an answer instead of adding a person.

**Guest writes are bounded by hand, because Admin SDK bypasses rules.** Names capped at 80
characters, free-time lists at 500 entries, votes must be a run of digits, booking durations
capped at eight hours. An unchecked list is a way to write a megabyte into someone else's
document, and an unchecked duration is a way to put an event stretching to the end of time on
her calendar.

**Expiry moves in two places or not at all.** The huddle document and its token both carry
`expiresAt`, because the token is what the guest function checks. Moving one without the other
leaves a live page behind a dead link, or the reverse.

**Zone labels only where they can save someone.** The booking confirmation shows both clocks when
the friend's zone differs from the host's, since that screen is the last moment anyone can catch a
three hour mistake. Where the zones agree, nothing is shown: a label on every time is noise that
trains people to stop reading labels.

**Owed to Jacky:** `hp_huddles` needs a rules block, in `docs/pending-rules.md`.


## 2026-08-26, the multi-party primitive, time zones, and link expiry

Jacky wants the group surfaces: suggest dates for an event, a template asking for the next few
slots that work, partners connecting their own calendars, and a live huddle link where a group
finds and votes on a time together. Push notifications were floated and then withdrawn as "just a
thought", so expiry ships without a reminder.

**One function under all six surfaces.** `coverage()` sweeps every boundary and labels each span
with who is free and who is not; `suggest()` ranks by turnout then by earliest. Suggesting event
dates, a template finding the next three Saturdays, the huddle, and the existing one-to-one friend
booking are all that call with different UI. Building the huddle first would have been building
the fifth skin before the thing under it.

**It counts rather than intersects, on purpose.** "When are we all free" is the special case
where the count equals everyone, and with five partners that set is usually empty while several
options work for four. Every span names who cannot make it, so the host can see the trade rather
than an empty result.

**Whole span, not any overlap.** A candidate slot must sit entirely inside a participant's free
time. Overlap would offer a 9-to-12 window to someone free only from 10, which is a slot they
cannot actually make.

**One suggestion per day.** Three times on the same Saturday is one option dressed as three, and
it crowds out the next real alternative.

**Time zones turned out to be cheap, because the model was already right.** Everything published
is absolute epoch milliseconds, so overlapping two people's free time needs no conversion at all.
Zones matter at exactly two edges: turning wall-clock open hours into absolute time, which happens
only in the host's own browser against her own clock, and display. `timeZone` is now stored on the
settings document, and `zones.ts` holds the formatting helpers.

**A real zone bug, found by clicking rather than reading.** The date suggestion chips wrote
`new Date(ms).toISOString().slice(0, 16)` into a `datetime-local` input. That converts to UTC, so
picking a 9am Pacific slot stored 16:00 and read back as four in the afternoon. `datetime-local`
has no zone of its own and means whatever the browser's zone is. `toLocalInputValue` in
`lib/dates.ts` is now the one way to fill one, used by both the suggestions and the booking page.

**Link expiry: presets to a month, then "never" is the honest answer.** `expiresAt` is nullable on
`hp_guestTokens`: null for party, crew, and friend links, which are meant to be kept, and set for
huddles and one-off calendar checks. An expired link is refused with exactly the same answer as a
revoked one, because a link that says "this expired" tells a stranger it was once real.

**Closing a day no longer throws its hours away.** Jacky's bug report. A closed day was stored as
null, so toggling it back on reset the times to a default she never chose. Closed is now a flag
beside the hours, the inputs stay visible and disabled rather than unmounting, and the normalizer
migrates old nulls to closed-with-defaults.

**Shipped this pass:** the primitive, zones, expiry, and "Open in your calendar" suggestions in
event creation, host-only. **Still to build:** partners connecting calendars through a guest link
with the non-sensitive `calendar.freebusy` scope, template-driven suggestions, the huddle with
voting, and zone labels on the guest surfaces.


## 2026-08-26, availability is a window, not a list of slots

Jacky, reviewing the first build: "availability isn't how many times, it's just open until it
isn't. I should say what times I'm open for things." And separately, kinds are duration
templates: "a default 1hr but I can adjust and I can just book something in an open slot."

That is a better model than the one that shipped, and it removes machinery rather than adding it.

**The 4,089 "open times" were a rendering choice leaking into the database.** The first version
enumerated every 30 minute start inside per-kind hour windows and stored the resulting list. That
is not a fact about her week, it is one way of drawing it, and storing it made an ordinary
calendar look like a wall of availability. Storage is now open windows: one row per open stretch,
a handful per day. A friend page can draw suggested times from a window; the reverse is not
possible.

**Capacity was the wrong fix, and she said so.** The obvious response to "too many slots" is caps:
two coffees a week. She rejected it, correctly. Caps answer "how much do I want to meet", which
is a different question from "when am I free", and the second one was the one being modelled
badly. Weekly caps are parked, not dismissed, in the plan's "not now".

**Two layers of hours, because one cannot express her week.** Open hours per weekday are the
sleep and downtime boundary, and nothing is ever offered outside them. A single band was the
first attempt and it breaks immediately on her own life: sunrise runs force the day to open at
6am, and then coffees and calls are offered at 6am too. Per-kind narrowing inside open hours is
the answer, and the defaults now start weekdays at 6:00 and weekends at 7:30, closing at 21:00.

**Duration moved from the host to the guest.** A kind used to fix its own length, so a "coffee"
was 45 minutes by definition. It is now a suggestion with a picker, and the guest page offers
half-hourly starts plus a free time input bounded to the window. The server recomputes the end
from the posted duration and never accepts an end, and it bounds duration at eight hours: an
unchecked one is a way to write an event stretching to the end of time onto her calendar.

**The reasoning panel was showing her a second copy of her calendar.** Her question was "why is
it showing me my events for the day", which is the right question: she has Google for that. It
now only lists readings worth questioning, meaning travel, out of town, and ignored. Anything
that merely blocked its own hours needs no explanation and is not shown.

**Automatic refresh on page open cannot be relied on, and the copy now says so.** Browsers only
allow a popup a click asked for. The silent token request usually succeeds with an existing
grant, but when it does not, it is blocked with no user gesture to justify a window. It fails
quietly on the automatic pass now rather than reporting a scary popup error for something she
never pressed, and the promise of "reads itself every time you open this page" was downgraded to
"refresh whenever your week changes", which is the truth.

**Schema drift took the page down, and the fix is a normalizer on read.** A settings document
written under the old shape has no `windows` field, and `settings?.windows.length` throws on it:
the optional chain guards `settings`, not `windows`. `src/data/availabilitySettings.ts` now fills
every missing field on read in both api implementations, so the UI cannot see a partial document
and the next shape change lands in one file rather than in every consumer.


## 2026-08-26, Google Calendar set up in the console, and read plus write

Console work done in Jacky's browser against `novarasocial-dev`. Most of it already existed,
which is worth recording because it changed the plan twice.

**The scopes were already there.** `calendar.readonly` and `calendar.events` were both already
declared as sensitive scopes on the consent screen before today, along with the non-sensitive
`calendar.freebusy` and `calendar.events.freebusy`. The Calendar API was already enabled. So the
only console change made was creating one OAuth client, "Novara host web", with origins
`http://localhost:5173` and `https://novara-host.web.app`. The consumer app's own web client,
hard coded in `google_auth.dart` for Android Credential Manager, was left alone.

**Checking beat assuming, three times in a row now.** The consumer app "already having calendar
stuff" turned out to be the device calendar (`add_2_calendar`, `READ_CALENDAR`,
`NSCalendarsUsageDescription`) plus a `calendar.google.com/render` deep link, none of which touch
OAuth. But the consent screen separately did already carry both Calendar API scopes. Both facts
were only knowable by looking.

**Publishing status is "In production", and an earlier draft of the setup doc was wrong to say
keep it in Testing.** Corrected. The Audience page's "Back to testing" button is now flagged in
the doc as the one not to press: in Testing only listed test users can complete OAuth at all, and
consumer users sign in to this project with Google, so it would lock out every real user not on
the test list.

**The OAuth user cap is a permanent, non-resettable resource.** 2 of 100 used. It counts people
granting unapproved sensitive scopes, which means each host connecting a calendar spends one
forever. Guests booking through links never authenticate and cost nothing. Recorded so a wave of
testers connecting calendars is a deliberate choice rather than a surprise.

**Read and write requested together, one consent.** Jacky asked for write so a confirmed event
lands on her calendar, considered full `calendar` access, then pulled back from managing whole
calendars. Landed on `calendar.readonly` plus `calendar.events`.

**The scope grants more than the code uses, on purpose.** `calendar.events` permits editing any
event on any of her calendars. `src/host/googleWrite.ts` tags everything it creates with a
private extended property and refuses to update or delete anything without that tag, so the worst
a bug there can do is damage events Novara created. Upserts are keyed by the tag rather than a
stored id, so running twice makes one event and a lost id cannot orphan a duplicate.

**Not yet wired:** nothing calls `upsertEvent` yet. Confirming a date, editing event details, and
friend bookings are the three triggers, and they are the next piece of work.


## 2026-08-26, Google Calendar connected, on its own OAuth client

Jacky's call: the file import does not work for a calendar that changes constantly, so F14 gets
the real integration now. Setup steps for her in `docs/Google_Calendar_Setup.md`.

**Reversed the same day: the client id DOES live in `novarasocial-dev`.** Jacky's call, and the
better one. The two products are heading for one identity with shared users and shared calendar
data, so they should share one consent screen; two would make people consent to two apparent
companies and force everyone to re-consent at merge. It gets its own web client inside that
project rather than reusing the Firebase-managed one, which the consumer app hard codes for
Android Credential Manager, so shared identity is kept without touching a credential consumer
sign in depends on.

Checking the consumer app rather than assuming settled it. It requests only `profile` and
`email`, both basic. Its calendar features are the **device** calendar (`add_2_calendar` plus an
OS permission) and a `calendar.google.com/render` deep link, neither of which touches Google
OAuth. So `calendar.readonly` is the project's first sensitive scope, and scopes are requested
per call, so consumer sign in is unaffected. The cost is that publishing broadly later needs
verification, which is needed by then anyway.

The original reasoning is kept below because the shape of the risk is still worth knowing, but
the conclusion it reached was wrong, and it overstated the danger: adding a scope to a consent
screen does not change what consumer users see at sign in.

**Superseded reasoning, kept for the risk shape.** The OAuth client id deliberately does NOT live in `novarasocial-dev`. A Google Cloud project
has one OAuth consent screen shared by everything in it, and `calendar.readonly` is a Google
sensitive scope. Adding it to the Firebase project's consent screen would change what every
Novara consumer user sees when they sign in with Google, and would push a published screen back
into verification review, which can hold up consumer sign in while it is pending. That is
consumer infrastructure, so the rule is to surface it rather than change it. An OAuth client id
does not have to share a project with Firebase: calendar access gets its own small project and
its own consent screen, driven by Google Identity Services rather than Firebase Auth's provider.
The cost is one extra consent prompt, which is arguably clearer anyway.

**Testing mode, not published.** Publishing a sensitive scope triggers Google verification,
which is weeks of review and only buys the ability to let strangers connect. Testing mode works
immediately and allows 100 test users. The trade is an "unverified app" interstitial once and a
grant that lapses every seven days.

**The privacy shape is unchanged, which is the point.** Google talks to the browser, the browser
derives, and only the openings are published. Nothing about the calendar reaches our server on
either path, so nothing about the guest function or the rules changed.

**Google answers what the .ics rules have to guess.** `eventType` identifies working location
markers and birthdays outright, and the attendee list says whether she accepted. Declined
invitations no longer block time, which on a calendar that gets a lot of invitations is probably
the single largest source of phantom busyness. `singleEvents=true` also makes Google expand
recurrences, so none of the RRULE handling applies on this path.

**Refresh is on page open, not on a schedule, and that is a real limit.** Background sync needs a
stored refresh token and a job that can read her calendar, which gives up the property above.
The staleness window is the gap between visits, and a friend can book a slot that filled since.
Recorded in the plan's "not now" rather than quietly ignored.

**A blocked popup used to hang the button forever.** Google calls exactly one of `callback` or
`error_callback`, and in some failure modes neither: a popup blocked before it opens left the
promise unsettled and the button stuck reading "Reading". Now a first-outcome-wins settle plus a
timeout guarantees an answer, and a blocked popup says so specifically, because "Google did not
grant access" would send her looking in entirely the wrong place. Found by clicking it, not by
reading it.

**Three request modes, because "did she ask" and "may we prompt" are different questions.**
`auto` on page open stays quiet about needing consent. `refresh` is asked for but tries silently
first, so it does not re-prompt for consent already given. `connect` may open Google's window.
An expired grant flips the button back to Connect, which was a dead end in the first pass: it
told her to reconnect while showing only a refresh button.


## 2026-08-26, availability built end to end, and the privacy shape that fell out of it

F14 to F19 built and verified in mock mode: calendar file in, openings out, friend link, guest
booking, host sees the booking. Details in `docs/Availability_Feature_Plan_v1.md`.

**The calendar never leaves the browser, and that turned out to be the cheaper design.** The
first shape stored normalized events in Firestore so the guest function could derive slots. Two
problems: it puts a copy of Jacky's whole calendar in a database, and it puts the blocking rules
in two build roots that would drift, the way `guestTypes.ts` already has to be kept in step by
hand. Storing only the derived openings fixes both. The `.ics` is parsed and derived client
side, and `hp_availabilitySettings` holds a flat list of start times per kind. The guest
function is then a filter, not a rules engine: no second copy to drift, and a breach or a bad
rule can only ever leak when she is free, which is the thing she is publishing anyway.

**ICS rather than Google OAuth, for now.** OAuth needs a consent screen configured in Google
Cloud and, past a point, verification review. An exported `.ics` needs none of that and works
tonight. Both sit behind the same interface, so the secret iCal URL fetched by a scheduled
function is an upgrade rather than a rewrite. No file reaches Storage: it is read in the browser
and discarded, which also leaves the M0 Storage non-goal intact.

**The `booking` token scope widens what a guest token means.** Every other scope names an event
and reads from that event's subtree. A booking link belongs to the host, so `eventId` is now
nullable on `hp_guestTokens`. Still two endpoints, per the standing rule: `book_slot` and
`cancel_booking` join the action switch and are refused for every other scope, and the four
event actions are refused for `booking`.

**The server re-checks every booking against the published offers.** Trusting the posted slot
would let a stale page double-book, and this is the only shared state in the feature. The friend
sees an honest "that time was taken while you were deciding" rather than a silent success.

**Two bugs found by running it, not by reading it.** `npm run dev:mock` did not actually run
without a backend: `AuthProvider` imports `lib/firebase` statically, so `initializeApp` ran and
threw on an absent `.env.local`. Mock mode now uses the same placeholder config as the emulator.
Separately, the mock store loaded persisted JSON as is, so a store saved before a new collection
existed came back missing that key and every read of it threw. It now merges over a fresh
fixture, which makes demo state survive a schema change instead of needing a manual cache clear.

**Left for Jacky:** the rules blocks in `docs/pending-rules.md` gate taking this off mock.


## 2026-08-26, personal availability calendar: placement and four decisions

Jacky wants a personal availability layer over her own calendar: friends book a coffee, a run,
or a call into slots derived from what her calendar already says. Four decisions came out of the
routing conversation.

**1. Event Zero is no longer a gate.** Jacky's call: keep it as an idea of validation, but stop
treating it as the thing that has to happen before more gets built. Features may land ahead of
their PRD milestone. This supersedes the reflex in CLAUDE.md and PRD 8.5 to shrink toward the
PRD whenever a feature idea appears mid-build. Scope discipline now means "record the decision
here", not "defer to the milestone". The PRD 4.6 non-goal on external calendar sync is therefore
overridden for this feature specifically, not deleted.

**2. It lives in this repo, not in `novara-matching`, and not in a new service.** `novara-matching`
is a Python CLI over spreadsheets: no server, no HTTP, no TypeScript. Renaming it into a shared
front end service would replace its contents and keep only the name, and would blur the one-subject
discipline that makes `MATCHING.md` plus `MATCHING_INBOX.md` work. A service is also premature at
one app and one user, and would add a third repo to a rules-deploy handoff that has already
stranded changes off `main` twice in one day.

**The seam that makes the service unnecessary.** The feature is three parts with different
portability: calendar ingest (Google-specific, needs a server, not reusable), derivation
(events plus rules to slots, a pure calculation), and the booking surface (different in each
app anyway). Only derivation is worth sharing, and a pure function is shared by moving a file,
not by adding a network hop. It lives in `src/lib/availability/` with no firebase, react, clock,
or network imports, so it lifts into a package unchanged when the consumer app wants run booking.

**3. One link per friend, not one public link.** Availability is private to friends, opened for
booking per person. This keeps the existing capability-token shape rather than introducing a
broadly shared URL, which would have been a different security object: no rate limiting (the M0
accepted risk covered five known partners, not a forwarded link), and it would leak the shape of
her calendar to anyone holding it.

**4. Horizon is per link, default 90 days.** Jacky's reasoning: three months out is ironically
the easiest place to find a shared open slot, and it matches the 90 day runway she already wants
for events. Longer horizons are real, six months, or a year for something like a bachelorette,
so the horizon is a setting on the link with a default rather than a constant.

**Blocking rules ship as defaults, tuned later.** How far an event blocks around itself is
Jacky's domain knowledge, not derivable from the calendar. First pass is a written default set,
to be corrected against real events and eventually made customizable or learned.


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

## 2026-08-25, open signup replaces the allowlist

- The allowlist gate is gone. Anyone who signs in with Google gets their own workspace. Jacky's call: with multi-tenancy real, new users are welcome as testers and early adopters. Supersedes PRD 0.4 and the CLAUDE.md hard rule, both updated.
- **The ordering was the whole safety argument.** The allowlist was a coarse fence in front of shared data, and everyone behind it could read everything. Owner scoping went live earlier the same day, so `hpOwns()` is enforced per document and "anyone signed in" is no safer or less safe than "anyone on a list". Doing this a day earlier would have handed the entire database to anyone with a Google account.
- Removed with it: the two refusal screens, the `retry` path, the allowlist read in `AuthProvider`, and one billed `get()` per Firestore operation.
- **The old flow is worth remembering as an anti-pattern.** A refused user was shown their own Firebase uid and asked to send it to Jacky, who pasted it into a database. A backend identifier in a text message, a dead end for anyone who did not already know the next step, and a console trip for the host. An invite-code flow was half built to replace it before the better answer turned out to be no gate at all.
- The rules test suite was reshaped rather than trimmed, 80 cases to 99. The old ones asked whether the right people get in. The new ones ask whether a brand new account that IS let in can reach anything of anyone else's: it can create its own documents, cannot create one owned by another uid, and cannot read or list the owner's rows.
- **Checked before shipping: a host signup does not touch the consumer app.** The consumer functions carry exactly one auth trigger, `onUserDeleted`, and no `onCreate` or blocking function; `users/{uid}` documents are written by the client app. So a host-app signup creates a Firebase Auth record and nothing else, and the consumer user count and the event-to-app crossover analysis stay clean.
- Open question for Jacky: the project's account-linking setting. The host app offers Google only, while 31 consumer accounts use Apple private relay. If the project is set to create one account per provider rather than link by email, the same person signing into each app gets two uids. Nothing breaks, and the record-versus-identity model already treats a host record and an app identity as different things, but it is worth knowing which way it is set.
