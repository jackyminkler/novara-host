# Build log

Decisions made mid-build and feature ideas parked to protect scope. Newest first.

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
