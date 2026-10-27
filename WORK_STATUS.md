## Stage 1 update — 2026-10-27

Baseline is `08769dd` on `upgrade/expo-sdk-54`; previous stabilization was preserved and pushed. Stage 1 implements AI privacy gates, dependency fixes, owner-only avatars, deletion cleanup with race protection, age UX removal and auth/logging safeguards. See [qa/STAGE1_SECURITY.md](qa/STAGE1_SECURITY.md) for controls, validation, residual advisories and environment limitations. No Stage 2 product work or production migration was performed.

Current validation: backend 55 tests, mobile 76 tests; lint and TypeScript pass; Expo Doctor 18/18; Android/iOS Hermes export smoke check. Backend audit 0, mobile audit 4 package findings representing 2 underlying issues. PostgreSQL 23-test suite and native builds have not been rerun in this session. The older build/database results below are historical, not evidence for this revision.

Next: restore an isolated test PostgreSQL environment and run `test:db`; resolve tracked Router/Metro advisory compatibility before public release. Then implement the separately approved Stage 2 scope. Keep release/device QA gates open.

---

# LevelUp — current work status

All stabilization and product changes are uncommitted. Existing user edits were
preserved. No deployment, push, production migration or destructive reset was run.

## Current scope (9 September 2026)

Finish the existing iOS UX/UI/accessibility pass, then rerun every automated check
and native release builds. Do not start another redesign or the production audit.

The previous Android core E2E passed, including registration/login, create/edit,
duplicate completion, a response lost after commit, a persisted draft after process
termination, API 503, delayed requests and logout/login. SQL matched the UI.

The broader product changes and remaining audit gates are in [qa/PRODUCT_QA.md](qa/PRODUCT_QA.md).
Safe server/mobile rollout and rollback are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Latest iOS findings

- A locally ad-hoc signed simulator build is required for Keychain/session QA.
  The earlier unsigned build compiled and launched but could not verify Keychain.
- Signed Debug login and session restoration work. Native accessibility now exposes
  Home's XP/level and streak values, four visible tab names, task-specific completion
  and resume labels, and explicit action-menu/date/time button roles.
- Native create/edit works with Save above the keyboard. Explicit keyboard dismissal
  before saving removes a reproducible pending keyboard/sheet transition in UI tests.
  Cancel/back close handlers also dismiss the keyboard.
- A native double-tap completion produced one activity and +50 XP. Daily streak moved
  from 1 to 2; pause/resume after completion did not award XP again. PostgreSQL verified.
- Full native UI tests are being consolidated; large-font checks and final release
  rebuilds are still pending. Early XCTest failures were selectors that looked for
  child text inside an accessible button, not missing rendered app data.

## Last complete automated checks (before the final iOS fixes)

- Backend: 41 tests, lint, TypeScript build.
- Mobile: 62 tests across nine suites, lint, strict typecheck.
- Dedicated PostgreSQL 16: 23 tests covering concurrency, idempotency, rollback,
  terminated connections, session revocation and persisted avatar data.
- Production Hermes exports: Android and iOS succeeded using an HTTPS placeholder.
- Earlier clean native Android arm64 Release and iOS Simulator Release builds passed.
- Expo Doctor: 18/18. Last dependency report: backend 0; mobile 28 inherited advisories
  (19 moderate, 9 high). No forced major Expo/dependency upgrade was applied.

## QA environment and limits

Only isolated `levelup_test` and `levelup_smoke_test` databases on localhost:55432
are used for writes. The user's original localhost:5432 database was read-only
audited; its two new migrations remain unapplied and two legacy avatars await migration.
Backup/restore into a third isolated database previously matched rows/checksums.

Native source copy: `/Users/vladyslav/Library/Caches/levelup-clean-pfovnip4`.
iOS DerivedData: `/Users/vladyslav/Library/Caches/levelup-ios-derived`.
XCTest harness/results: `/tmp/levelup-ios-product-qa` and `/tmp/levelup-ios-product-*.xcresult`.
Simulator: `LevelUp QA`, AB5DCBA5-F3D9-436C-A661-25B0BA6CCEE8 (iPhone 17, iOS 26.5).
The installed 23F73 runtime is explicitly matched to SDK build 23F81a.

The local `.env` files use HTTP development endpoints. Release checks use
`https://levelup.example.test`, which is a placeholder, not a verified production API.
App Store/Play signing, real-device VoiceOver traversal/notifications, production
hostname/secrets/SMTP/optional AI and offline cold-start reading remain separate gates.
An Android debug inspector crash on live font-scale change still needs a Release
reproduction check; do not classify it as a verified release crash or silently ignore it.
