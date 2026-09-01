# Personal availability calendar, plan and journey map v1

Date: 2026-08-26. Status: building. Feature numbers continue the PRD's F-series.

Jacky's own calendar gets an availability layer on top of it, so friends can book a coffee, a
run, or a call into time she is actually free. Placement, the per-friend link decision, the 90
day default horizon, and the blocking-rule defaults are settled and recorded in
`docs/build-log.md` under 2026-08-26.

---

## 1. The two journeys

### Jacky's journey

1. **Connect a calendar.** She drops in a `.ics` export, or later pastes the secret iCal address
   Google gives every calendar. No account linking, no consent screen.
2. **See what the tool thinks.** Her real events render, and next to each one a small note
   saying what it blocked and why: "out of town, takes the weekend", "evening event, morning
   stays open", "ignored, all day with no location". The reasoning is visible, because a
   scheduling tool that silently hides half her calendar is one she stops trusting.
3. **Correct it.** Any event's reading can be overridden by hand. Rules and slot shapes are
   editable: which kinds she offers, the hours for each, buffers, horizon.
4. **Add a friend.** Pick or type a name, get a link, send it over text or DM the way she
   already does with partners.
5. **A booking lands.** It shows up as a request or a confirmation, and from that moment it
   blocks like any other calendar event so nobody else can take it.

### The friend's journey

1. Taps the link on a phone, no account, no app.
2. Sees when Jacky is free, grouped by what they can do: coffee, run, call.
3. Picks one, picks a time, leaves a name and how to reach them.
4. Done, with a confirmation and a way to cancel.

The friend never sees her calendar, only the openings. That distinction is the whole privacy
model: the derived slots are the output, the events are never sent to the guest.

---

## 2. Features

**F14. Calendar source.** Two paths behind one interface, so the derivation layer never learns
where events came from.

*Google Calendar, the primary path.* Google Identity Services gets a read-only access token in
the browser, the Calendar API is called directly from there, and events are normalized and
derived locally. The page asks for a token silently when it opens, so a calendar that changes
constantly stays current with no manual step, and once she has published openings at least once
the automatic pass republishes them too. Tokens live in memory for about an hour and are never
stored. Google's own `eventType` and attendee response fields answer questions the `.ics`
heuristics have to guess at: a working location marker, a birthday, and an invitation she
declined are all identified outright rather than inferred from a title.

*A `.ics` file, the fallback.* Parsed in the browser, nothing uploaded. Kept because it needs no
setup at all, works for a calendar that is not Google's, and is the path that still works when
the OAuth client is not configured in a build.

**The client id lives in its own Google Cloud project, not `novarasocial-dev`.** A GCP project
has one OAuth consent screen shared by everything in it, and `calendar.readonly` is a Google
sensitive scope. Adding it to the Firebase project's screen would change what every Novara
consumer user sees at sign in, and would push a published screen back into verification review.
Setup steps in `docs/Google_Calendar_Setup.md`.

Acceptance: connecting Google produces a correct week within a few seconds, reopening the page
refreshes with no prompt, and a build with no client id still works through the file path.

**F15. Open hours.** The host says when she is open, per weekday, and nothing is ever offered
outside it. This is the sleep and downtime setting, and it is the only time constraint: inside
those hours, anything the calendar has not taken is bookable. Availability is a stretch of time,
not a count of appointments, so there are no caps and no slot quotas.

Kinds of thing to do (coffee, run, call) are duration *templates*: they suggest a length the
person booking can change, they do not define a fixed slot. Buffers and the per-weekday hours are
editable and re-derive immediately.

Acceptance: closing Sunday removes every Sunday opening, and moving Monday's start to 9:00
visibly shortens Monday's window.

**F16. Availability view.** The derived picture for the host: the open stretches, a total, and
the next few real days spelled out. Alongside it, only the calendar readings worth questioning,
meaning travel, out of town, and ignored. Events that merely blocked their own hours are not
listed: repeating her calendar back at her tells her nothing she cannot see in Google.

Acceptance: one glance answers "when am I actually offering time, and why is Saturday empty".

**F17. Friend links.** A named friend, a capability token, and a horizon. One link per friend,
never one public URL: an unthrottled shared link would leak the shape of her calendar to
whoever it gets forwarded to, and the M0 "no rate limiting, five trusted partners" risk does not
carry over to something sent to thirty people. Horizon defaults to 90 days, editable per link,
because a bachelorette needs a year and a coffee needs a month.

Acceptance: revoking a link stops it working immediately, same as partner links.

**F18. Guest booking page.** Mobile-first at 390 px, served by the existing `hpGuestView` with a
new `booking` scope. No third endpoint. Booking writes through `hpGuestSubmit` with a new action.

Acceptance: a friend who has never seen the product books a coffee in under 60 seconds with no
instructions.

**F19. Bookings.** The host's list of what has been booked, with cancel. A confirmed booking
blocks the slot for every other friend, which is the one piece of shared state in the feature
and the one place a race can happen.

Acceptance: two friends cannot book the same time.

---

## 2b. F20. Plans: deadlines, the pick, and the invite

Added 2026-08-26 after PR #1 merged. Jacky's ask, generalized: someone brand new signs up,
creates a plan ("find 90 minutes for the ten of us, evenings or weekends, before September
12"), sends one link to the group chat, everyone drops in their calendar or picks days by
hand and votes, the organizer picks a time, and everyone's calendar gets the invite. The
worked example is a fantasy football draft night; nothing in the feature knows that. Every
piece is a global capability on the existing huddle, not a template.

**The user-facing word is "plan"** (Jacky, 2026-08-26). Code keeps `Huddle` and `hp_huddles`;
every UI string says plan.

The huddle from PR #1 already carries the group link, freebusy joins, one moving vote per
person, and `settledStartsAt`. F20 finishes the journey:

**F20.1 Hours, not just weekdays.** `weekdays: number[]` is replaced by `hours: DayHoursDoc[]`
(7 entries, the same shape as open hours: an open flag plus a start and end per weekday).
"After work or weekends" is different hours on different days, which weekday chips cannot
say. It also fixes a real flaw: freebusy counts 3am as free, so an unconstrained huddle
could rank 2am as the best slot. Default when creating: every day open 09:00 to 22:00.
Old documents with `weekdays` are migrated on read.

**F20.2 Allowed windows are published, not recomputed.** The organizer's browser turns
`hours` into absolute `allowed: {s,e}[]` intervals at create and edit time, exactly the way
availability publishing already works. Guests in any zone consume absolute milliseconds and
never convert wall clock, so there is no second zone conversion to get wrong. `suggest()`
gains one option, `within`, that intersects every participant's free time with those
intervals before coverage runs.

**F20.3 Two dates with different meanings.** `respondBy` (answers close) and `happenBy`
(the thing must have happened by then), both optional, stored as a `YYYY-MM-DD` string for
editing plus a precomputed end-of-day epoch millisecond for enforcement. The functions
compare numbers and never touch zones. Phase is derived, in order: `settled` (a pick
exists), else `passed` (happenBy has gone with no pick), else `closed` (respondBy has
gone), else `open`. Joins and votes are accepted only while open; the guest page renders
all four states, so someone coming back after the cutoff sees the pick or "no time was
picked". Plan links default their expiry to two weeks after `happenBy` so the page
outlives the outcome.

**F20.4 Joining by hand.** The guest page currently requires a Google read to join. It
gains a manual path: pick the days that could work from the plan's own allowed days, and
your free time is those days' allowed windows. One tap per day, works with no Google at
all, and provenance is kept (`source: 'calendar' | 'manual'`) the way date responses
already keep theirs. Joining also asks for an optional email, "for the calendar invite
later", never shown to other guests.

**F20.5 The pick.** The plan detail page shows the ranked times with turnout and votes.
The organizer picks one, which opens a small composer prefilled with the time: adjust
start or duration, add a location and notes, lock it in. That writes `settledStartsAt`,
`settledEndsAt`, `location`, `notes`. Un-picking reopens the plan.

**F20.6 The invite.** After the pick: create a Google Calendar event on the organizer's
own calendar through the existing tagged write path, with everyone who left an email as an
attendee and `sendUpdates=all`, so Google delivers the invites and every later edit. This
is the first caller `googleWrite.ts` gets, and it gains attendee support and returns the
event link. Editing details after creation updates the same tagged event. For anyone who
left no email, the settled guest page offers "Add to Google Calendar" and a downloadable
.ics, so nobody is stranded. No email provider anywhere.

**F20.7 A first-class surface.** Plans move out of the availability page into their own
sidebar item: a list page with the create flow, and a detail page per plan. Guests keep
the same `/g/{token}` link through the same two functions with the same `huddle` scope.

Also fixed under this feature: `GUEST_ACTIONS` in the functions build root never listed
`join_huddle` and `cast_vote`, so real (non-mock) huddle submissions were refused as
`unknown_action` before reaching the scope handler. The two runtime allowlists now agree
with the type.

No new collections. `hp_huddles` gains fields only, so the pending rules blocks apply
unchanged. New Amplitude events: `hp_plan_created` (renaming `hp_huddle_created`, recorded
in the build log), `hp_plan_joined`, `hp_plan_vote_cast`, `hp_plan_settled`,
`hp_plan_invite_created`.

Acceptance: a signed-up stranger creates a plan and shares it in under a minute; a guest
with no Google account joins by hand and votes in under 60 seconds at 390 px; after the
deadline the page says answers are closed; after the pick every guest can put the time on
their calendar in two taps; after an unpicked cutoff the page says so plainly.

---

## 3. State of play, 2026-08-26

Everything below is committed and pushed on `claude/personal-availability-calendar-fa0d89`
(PR #1). Read `docs/build-log.md` for why each decision went the way it did; this section is only
what exists and what does not.

**Built and verified:**

1. Derivation core, pure, in `src/lib/availability/`. No firebase, react, network, or clock reads.
2. ICS parsing, and Google event normalisation.
3. Data model, api seam, mock and firebase implementations.
4. Host availability page: open hours, calendar connect, publish, friend links, huddles.
5. Guest booking page and guest huddle page, both mobile-first.
6. Google Calendar read and write via Google Identity Services, on a dedicated OAuth client
   inside `novarasocial-dev`. Guests use the non-sensitive `calendar.freebusy` scope.
7. Multi-party `coverage`/`suggest`, time zones, link expiry.
8. Guest function support for the `booking` and `huddle` scopes, on the existing two endpoints.

73 unit tests, both build roots typecheck clean, `npm run build` passes.

**F20 built on top of this, 2026-08-26 night session** (branch
`claude/availability-calendar-continue-750d53`): plans as their own sidebar surface with a
create flow and a detail page, per-weekday hours with published allowed windows, respond-by
and happen-by deadlines with four guest phases, manual joins with optional bounded emails,
the organizer's pick with a composer, the Google Calendar invite through `googleWrite` with
ICS and add-to-Google fallbacks, and the `GUEST_ACTIONS` fix that was silently refusing all
real huddle submissions. 126 unit tests, both build roots typecheck, build passes.

Verified live in mock mode: the full journey (create with weekday-evening plus weekend
hours, guest joins by hand at 390 px with today dropped and the list bounded by happen-by,
turnout ranking across two participants, a moving vote, the pick with an edited time,
location and notes on the settled card, correct UTC times in the Google render URL, the
closed state, the passed state, and the change-my-answer prefill round trip). Not
exercised tonight, needs a Google client id and a signed-in host: the freebusy join path
and real invite creation; both are code paths on machinery PR #1 already exercised.

**Not done, in the order worth doing them:**

- **A settled plan does not create an event workspace.** The pick carries location and
  notes and the invite, which covers a plan-first gathering. Turning a settled plan into an
  `hp_events` workspace (tasks, run of show, parties) should feed the existing
  event-creation flow rather than a second path.
- **`googleWrite.ts` has one caller now, the plan invite.** The other two triggers are
  still unwired: confirming an event date, and a friend booking landing on her calendar.
- **Partner calendar answers are per-date only.** A partner connecting their calendar answers the
  proposed dates yes or no. Their free windows are not retained, so `suggest` cannot yet rank
  dates across host plus partners. The pieces exist; nothing joins them.
- **Zone labels are on the booking page only.** The plan page shows the viewer's zone; the host
  pages assume one zone throughout.
- **The invite's Google link is not stored.** After a reload the settled card offers
  "Update the invite" but not "Open in Google Calendar" until one update runs, because
  `htmlLink` lives only in the create response. One nullable field would fix it.

**Blocked on Jacky, and it blocks real testing:** four rules blocks in `docs/pending-rules.md`
(`hp_availabilitySettings`, `hp_friendLinks`, `hp_bookings`, `hp_huddles`). Verified against the
deployed ruleset on 2026-08-26: not applied, not deployed. Until they are, `VITE_DATA_MODE=mock`
is the only way to run this. The blocks are inert while the collections are empty, so applying
them early costs nothing and applying them late is what holds up testing.

---

## 4. Decisions taken while building

**A booking token is not an event token.** `hp_guestTokens` currently requires an `eventId`, and
every guest read is scoped through an event. A booking link belongs to a host, not an event, so
`eventId` becomes nullable and the `booking` scope reads from the owner's availability rather
than an event subtree. This is the first token that is not about an event, and it is worth
knowing that is a real widening of what a guest token means.

**The friend never receives events.** `hpGuestView` computes slots server side and returns only
those. Sending raw events and deriving in the browser would be simpler and would hand every
friend the full contents of her calendar.

**Bookings block immediately, without a confirmation step.** A held-then-confirmed flow needs
expiry, reminders, and a way to chase, which is notification machinery the PRD does not have.
Booked is booked, and cancelling is one tap.

**No file lands in Storage.** The `.ics` is read in the browser and discarded. This keeps the
M0 Storage non-goal intact and means the raw calendar never leaves her machine.

---

## 4b. Where the consumer app deliberately differs, 2026-08-26

The Flutter consumer app built the same capability on its own branch
(`claude/google-calendar-availability-87130e` in the novara repo, ADR-0004 there). It kept the
load-bearing semantics: windows not slots, closed-is-a-flag, buffer padded on the busy side,
clamp to now, a 45 minute floor, derive only on the owner's device, and store only derived
windows. Four differences are deliberate and are recorded here so nobody later assumes the two
products agree about everything.

1. **Weekday index runs 0 = Monday there, 0 = Sunday here.** Their convention is entrenched in
   two schemas and the matching scorer. This is the divergence most likely to cause a silent
   wrong answer, because both sides are plain numbers: a weekday array crossing the boundary
   unconverted produces a plausible result that is off by one, and `weekdays` on `SuggestOptions`
   is exactly such an array. If host and consumer availability data ever meet, convert at the
   boundary and give the two forms different field names so a raw number cannot pass for the
   other.

2. **They allow multiple windows per day; this repo allows one.** Runners do two-a-days, and a
   single `DayHours` per weekday cannot express "open 6 to 8am and again 6 to 8pm". Their model is
   the better one and this repo should probably adopt it: today a host wanting a morning run slot
   and an evening call slot has to open the whole middle of the day to get both.

3. **They dropped the travel and out-of-town rules for v1.** No travel hints, no home city, no
   weekend extension. An all-day event with a location still clears the day. Reasonable where the
   question is "can this person run on Tuesday" rather than "is she in another state all weekend",
   but it means a flight blocks only its own hours over there.

4. **They use no sensitive scopes at all.** Device calendar first, `calendar.freebusy` second. The
   consumer app therefore never draws on the shared project's 100 lifetime unapproved-sensitive
   grants, which this repo's host flow does spend from.

---

## 5. Not now

**Weekly caps on how much she meets.** Rejected for now, and worth recording why: a cap answers
"how much do I want to meet", which is a different question from "when am I open". Only build it
if the honest windows turn out to attract more than she wants.

**Background sync.** Refresh happens when she opens the page, not on a schedule. Doing better
means a stored refresh token and a scheduled job, which means a server that can read her
calendar, which is the exact privacy property this design exists to protect. The staleness
window is the time between visits, and it is real: a friend can book a slot that filled up since
she last opened the app. Revisit only if that actually bites, and price the trade honestly when
it does.

Two-way sync back to Google. Recurring event expansion beyond simple weekly rules. Timezone
handling beyond the host's own zone. Reminders or emails to either side. Payment. Group
booking. Anything that requires the friend to have an account, ever.
