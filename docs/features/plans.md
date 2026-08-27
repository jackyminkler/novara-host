# Plans (group scheduling on huddles)

> Read this before you change the feature. Update it in the same commit.

## What it does

A plan finds a time for a group. The organizer, any signed-in host, creates one: what it
is, how long it needs, which days and hours are worth considering, when answers close
(respond by), and when the thing must have happened (happen by). They get one link for the
whole group. Everyone on the link joins with a name, drops in their calendar (a single
non-sensitive freebusy read) or picks days by hand, optionally leaves an email, and votes
on the ranked times. The organizer picks one, adds a location and notes, and creates a
Google Calendar invite that reaches everyone who left an email; everyone else gets add to
calendar buttons on the plan page. Coming back after the deadlines shows the pick, or that
no time was picked.

The user-facing word is always "plan". The code word is `Huddle`, kept from the first
build; the collection is `hp_huddles`.

## Surface map

- `src/data/types.ts`, `Huddle`, `HuddleParticipant`, and `HuddlePatch`. Fields beyond PR #1:
  `hours` (7 `DayHoursDoc`), `allowed` ({s,e}[] absolute ms, derived in the organizer's
  browser), `respondBy`/`respondByMs`, `happenBy`/`happenByMs`, `location`, `notes`,
  `settledEndsAt`, `googleEventId`, `hostDisplayName`, `timeZone`; participants carry
  `email` and `source` ('calendar' | 'manual'). `weekdays` is legacy, migrated on read.
- `src/lib/availability/plan.ts`, pure: `planPhase` (settled > passed > closed > open),
  `buildAllowedWindows` (hours to absolute intervals, organizer's browser only),
  `allowedDayGroups` (day rows for the manual picker), plus the migration from `weekdays`.
- `src/lib/availability/coverage.ts`, `suggest()` option `within`.
- `src/lib/calendarLinks.ts`, .ics text and the Google Calendar render URL. Distinct from
  `lib/availability/ics.ts`, which is the import parser.
- `src/host/googleWrite.ts`, attendees, `sendUpdates=all`, returns the event link.
- `src/data/api.ts` seam: `createHuddle`, `updateHuddle`, `extendHuddle` (the only place
  expiry moves, huddle and token together), `deleteHuddle`, `listHuddles`; both
  `mockApi` and `firebaseApi`; mock seed.
- `functions/src/guestTypes.ts` and `src/guest/guestTypes.ts` (deliberate twins),
  `HuddleView`; `functions/src/index.ts` `buildHuddleView`, `handleHuddleSubmit`, phase
  gating; `src/guest/mockGuest.ts` mirrors both.
- `src/host/pages/PlansPage.tsx` (list and create), `src/host/pages/PlanDetailPage.tsx`
  (share, participants, ranked times, pick, invite), nav in `src/host/HostShell.tsx`,
  routes in `src/host/HostApp.tsx`.
- `src/guest/HuddlePage.tsx`, all four phases at 390 px.
- `src/lib/analytics.ts`: `hp_plan_created`, `hp_plan_joined`, `hp_plan_vote_cast`,
  `hp_plan_settled`, `hp_plan_invite_created`.

## Change protocol

- Zones: wall clock becomes absolute time in the organizer's browser only, at create and
  edit. Everything downstream, ranking included, is epoch milliseconds. If you need a new
  wall-clock rule, derive it where the organizer is and publish the result.
- Deadlines are enforced by comparing stored `respondByMs`/`happenByMs` against now, in
  the functions and in mockGuest. Never parse the display strings server side.
- On `hp_huddles`, adding a guest-writable field is a security change even when it is not
  a rules change. Guests write through the Admin SDK, which bypasses rules, so the
  hand-rolled bounds in `hpGuestSubmit` are the only validation there is; an unbounded
  field simply writes, with no permission-denied to catch it. Every guest-settable field
  gets an explicit bound (length, type, count, whether it can be set twice) in the same
  commit that adds it, and `handleHuddleSubmit` only ever updates the `participants` and
  `votes` keys, never anything derived from the payload. (Flagged by the consumer-repo
  rules session, 2026-08-26.)
- The two `guestTypes.ts` copies and `mockGuest.ts` must move together with
  `functions/src/index.ts`. The `GUEST_ACTIONS` array is the runtime gate; adding an
  action to the type without the array refuses it in production only, which mock mode
  cannot catch.
- Participant emails exist for the invite. They must never appear in `HuddleView` for
  anyone but their owner (`yourEmail`).
- Expiry moves in two places or not at all: `extendHuddle` updates the huddle and its
  token. `updateHuddle` refuses `expiresAt` by omission from `HuddlePatch`.
- `googleWrite.ts` touches only events carrying the Novara tag. Keep it that way.
- Every UI string follows the copy rules in CLAUDE.md, and says plan, never huddle.

## Backward compatibility

- Documents written before F20 carry `weekdays` and lack the new fields. The read paths
  (firebaseApi, functions, mockGuest) migrate: missing `hours` derives from `weekdays`
  (listed days open 09:00 to 22:00, all days when empty), missing strings default empty,
  missing ms fields null. Rules were never deployed before F20, so no production
  documents predate it; the migration exists for emulator and mock continuity.
- The deployed guest functions before this change refuse `join_huddle`/`cast_vote` (the
  allowlist bug). Deploy functions and hosting together, as the deploy rule already says.

## Cross-product

Nothing consumer-side reads `hp_huddles`. The Google OAuth client is the host platform's
own (see `docs/Google_Calendar_Setup.md`); guests use only the non-sensitive freebusy
scope, so nothing here touches the consumer consent screen. A consumer-side session is
separately building availability under `users/{uid}/matching_profile/`; the names are
similar and the products are not, do not consolidate them.

## History

- 2026-08-26. F20 built on the PR #1 huddle: hours, allowed windows, respond by and
  happen by, manual joins with optional email, the pick, the Google invite with ICS
  fallback, plans as a sidebar surface, four guest phases. `GUEST_ACTIONS` twin-drift
  bug fixed. No new collections.
