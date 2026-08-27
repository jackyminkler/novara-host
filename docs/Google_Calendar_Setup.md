# Connecting Google Calendar

Set up 2026-08-26. The console work is done; the only thing left is pressing Connect once.

## Which project, and why

**`novarasocial-dev`, the same project everything else uses.** The host platform and the consumer
app are heading for one product with one user identity and shared calendar data, so they should
share one OAuth consent screen. Two screens would mean people consent to "Novara" and "Novara
host" as if they were different companies, and at merge time everyone would have to re-consent
under a new client id anyway. Building on the target identity now avoids that.

**A separate OAuth client id inside that project, not the existing one.** The consumer app hard
codes the Firebase-managed web client
(`546085339610-...apps.googleusercontent.com`) in `lib/auth/firebase_auth/google_auth.dart`,
where Android Credential Manager needs it. Adding JavaScript origins to that client would
probably be harmless, and "probably harmless" is not a good enough reason to touch a credential
the consumer app's Android sign in depends on. A second web client shares the same project and
the same consent screen, so nothing about the shared identity is lost.

## What the consumer app requests today

Checked on 2026-08-26, so the starting state is known rather than assumed:

- `google_auth.dart` requests `scopeHint: ['profile', 'email']`. Both are basic, non-sensitive
  scopes. Google does not require verification for those, which is why sign in works today with
  no review.
- `add_2_calendar` and `Permission.calendarFullAccess` are the **device** calendar: an operating
  system permission to write an event into the phone's own calendar app. No Google account, no
  OAuth, no consent screen.
- The "Add to calendar" web button is a `calendar.google.com/calendar/render` deep link that
  prefills Google's own UI. No API call, no token.

So the project has never requested a Google Calendar API scope. This is the first one.

## What "sensitive scope" means

Google sorts OAuth scopes into three tiers by how much they expose:

- **Basic** (`profile`, `email`, `openid`): who you are. No review, no warnings.
- **Sensitive** (`calendar.readonly` among them): real personal data. Requires verification
  before the app can be published to the general public, and shows an "unverified app"
  interstitial until then.
- **Restricted** (Gmail contents, full Drive): requires verification *plus* an annual third party
  security assessment that costs real money.

`calendar.readonly` is sensitive, not restricted, so there is no security assessment in the
future. Verification for a sensitive scope wants a homepage, a privacy policy explaining what the
app does with calendar data, and a demo video of the scope in use.

**What adding it does and does not do.** Scopes are requested per authorization call, not granted
wholesale, so the consumer app keeps asking for exactly `profile` and `email` and its sign in is
unaffected. The unverified treatment attaches to the request that asks for the sensitive scope,
which is only ever the host app. The real consequence is that the project is now an app that uses
a sensitive scope, so publishing it broadly later means going through verification.

## Already done, 2026-08-26

Checked in the console rather than assumed. Most of this turned out to exist already.

- **Google Calendar API: enabled.**
- **Scopes: already declared on the consent screen.** Both of the ones this needs were there
  before today: `calendar.readonly` ("See and download any calendar you can access") and
  `calendar.events` ("View and edit events on all your calendars"), both sensitive. Also present
  and non-sensitive: `calendar.freebusy` and `calendar.events.freebusy`. No restricted scopes.
  Nothing had to be added.
- **OAuth client created:** "Novara host web", a web application client in `novarasocial-dev`,
  with JavaScript origins `http://localhost:5173` and `https://novara-host.web.app` and no
  redirect URIs. The consumer app's own web client, the one hard coded in `google_auth.dart`
  for Android Credential Manager, was not touched.
- **Client id written to `.env.local`.** The client secret was deliberately not stored: this
  flow has no server side to keep one on.

The only step left is granting consent, which happens the first time you press "Connect Google
Calendar".

## The state of this project, worth knowing

**Publishing status is "In production", not Testing.** My earlier draft of this document told you
to keep the app in Testing. That is wrong for this project and following it would be harmful.

**Do not press "Back to testing" on the Audience page.** In Testing, only listed test users can
complete OAuth at all, and consumer users sign in to this project with Google. That button would
lock out every real user who is not on the test list. It is the most dangerous control on that
screen and it sits right under the publishing status.

**The OAuth user cap is 2 of 100 used.** That cap counts people who grant *unapproved sensitive*
scopes, it lasts the lifetime of the project, and Google states it cannot be reset or changed.
So each host who connects a calendar permanently consumes one of the remaining 98. Friends
booking through guest links never authenticate, so they cost nothing. At one host that is a
non-issue; it is worth remembering before inviting a wave of testers to connect calendars.

**Verification has not been submitted.** The justification field and demo video are empty. Until
it is submitted and approved, anyone connecting a calendar sees the "unverified app" screen:
Advanced, then continue. Google's own warning on that page is worth repeating: do not deploy
unverified scopes to production traffic, because it consumes that unverified user quota. Only
the host app requests calendar scopes, so consumer sign in never touches it.

**There is a non-sensitive escape hatch if verification ever becomes urgent.**
`calendar.freebusy` is already declared and needs no verification at all, at any scale. It
returns busy intervals with no titles or locations, which is enough for a plain free and busy
overlay and not enough for the rules that make this worth using: no flight detection, no out of
town weekends, no "evening event leaves the morning open". Worth knowing the option exists;
not worth taking unless verification stalls.

## What happens after you connect

- The page asks Google for an access token when it opens. If the grant is still good this happens
  silently, with no prompt, and your calendar is re-read.
- Tokens live in memory for about an hour and are never written to storage.
- Your calendar goes from Google to your browser. It is derived there, and only the resulting
  open times are saved. Titles, locations, and guests never reach our server.
- Once you have published open times at least once, the automatic refresh republishes them, so a
  calendar that changes constantly stays current with no manual step.

## The staleness window, worth knowing

Refresh happens when you open the page, not in the background. If you do not open the app for a
week and your calendar fills up, a friend can book a time you no longer have. Closing that
properly needs a stored refresh token and a scheduled job, which means a server that can read
your calendar, which is exactly the privacy property this design is built to avoid. Two honest
ways to narrow it without giving that up:

- Keep the offered horizon shorter, so fewer far out times are exposed.
- Open the app when your week changes, which is roughly when you would want to look anyway.

If background sync becomes worth the trade, the decision to revisit is in
`docs/Availability_Feature_Plan_v1.md`.

## When the products merge

Nothing here has to be undone. The consumer app requests calendar access from the same consent
screen, using its own platform client ids the way it already does for sign in, and the user sees
one Novara asking once. The only thing that becomes necessary is verification, which is necessary
by then anyway.

## If something goes wrong

- **"Access blocked: this app has not been verified"**: expected before verification. Advanced,
  then continue. If the account is not on the test user list you get a hard block instead, which
  is the fix: add them.
- **Nothing happens on click**: the origin must match exactly, scheme and port included.
  `http://localhost:5173` is not the same origin as `http://127.0.0.1:5173`.
- **It worked yesterday and now asks again**: click Connect once more. Google documents a seven
  day expiry in Testing mode for *refresh tokens* specifically. This app does not use refresh
  tokens, only the one hour access token, so you may never hit it.
