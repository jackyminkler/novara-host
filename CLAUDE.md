# CLAUDE.md

Novara host platform: a coordination workspace for community event hosts. The host has an account; co-hosts, sponsors, and vendors participate through tokenized guest links with no account. Web only.

Build contract: @docs/Novara_Host_Platform_PRD_v1.md
Strategy context (read on demand, do not import): docs/Novara_Host_Platform_Plan_v1.md

## Hard rules

- Never modify the Novara consumer app repo, its Cloud Functions, or any Firestore collection that does not start with `hp_`. If a change there seems necessary, stop and surface it instead of making it.
- Guests never authenticate and never touch Firestore directly. All guest reads and writes go through the two HTTP functions (`hpGuestView`, `hpGuestSubmit`) with capability token validation. Do not add guest-side Firestore access, anonymous auth, or partner accounts.
- Host access is Google sign-in plus the UID allowlist in `hp_config/allowlist`. Every `hp_` collection gets an explicit security rules match block with the allowlist condition; rules cannot wildcard a collection-name prefix. Never propose a collection-group rule (`match /{path=**}/name/`): those span the consumer app's subcollections too in the shared ruleset.
- This repo never deploys Firestore rules. The consumer app repo owns `firestore.rules` for the shared project. firebase.json here must contain no `firestore` section, and deploys always use explicit targets (`firebase deploy --only functions:hosts,hosting:novara-host`). When a new or changed `hp_` collection needs rules, a composite index, or (from M1) a Storage rules path, write the exact match block or index definition to `docs/pending-rules.md`, tell Jacky, and stop. She applies it through the consumer repo, which owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared project. Queries needing a composite index fail at runtime until the index is applied and built, so surface index needs as soon as the query is written, not when it breaks.
- Respect the M0 non-goals in PRD section 4.6. When a feature idea appears mid-build, shrink toward the PRD instead of expanding, and note the idea in the build log.

## Copy rules (apply to every UI string, error, and empty state)

- Never use em dashes. Use commas, periods, or colons.
- Sentence case for all headings, buttons, and labels.
- Plain, warm, non-corporate voice. Never use the word "engagement" in product copy.
- Outputs are activities, tasks, and dates, never lists of people.

## Design tokens

- Font: Poppins (400, 500, 600, 700).
- Background `#FAFAFE`; text and headings dark navy `#1A1A2E`; white cards with subtle borders.
- Primary actions and accents only: 135 degree gradient `#7B5AFF` to `#C45ADB` to `#FF6B8A`.
- Icons: Lucide only.
- Guest routes are designed mobile-first at 390 px and must load in under two seconds on LTE. Host routes are responsive, desktop-comfortable.

## Stack

React 18 plus Vite, Tailwind, Firebase (Auth, Firestore, Functions on Node 20, Hosting multi-site), Amplitude Browser SDK. Functions deploy under a separate `codebase` in firebase.json so existing consumer functions are untouched. Prefer boring solutions: simple refetch over realtime listeners where either works, one HTTP function with an action switch over many endpoints.

## Definition of done, every feature

1. Meets its acceptance criteria in PRD section 4.2.
2. Every new UI string passes the copy rules above.
3. Guest-facing changes verified at 390 px.
4. The relevant Amplitude events from PRD 4.3 fire.

Keep this file short. When a durable convention emerges during the build, add one concise line here rather than re-explaining it in chat next session.
