# Product QA — September 2026

This is a verification record, not a production approval. All mutation tests use
isolated local databases and dummy accounts. The existing user's database was not
migrated or modified. The source changes remain uncommitted.

## Implemented product changes

- Four primary destinations: Home, Tasks, Progress, Profile. History, achievements,
  settings and the existing AI helper retain explicit return navigation.
- Home prioritizes the next task and creation. Task, progress, history and optional
  advice requests do not block one another. Streak guidance explains daily counting.
- Tasks offer active/paused filters, a direct completed-history link and title-to-edit.
  Sorting is memoized, with timezone date calculation once per timezone per sort.
- Create/edit keeps Save and Cancel above the keyboard, preserves drafts on failure,
  exposes selected categories/schedules to accessibility services, and limits sheet width.
- One-step registration, scrollable keyboard-aware auth forms, autofill metadata and
  inline validation. Optional profile fields remain in Settings. Uniqueness is checked
  atomically by the server, without availability preflight requests.
- Shared action/empty-state components, bounded page widths, consistent purple branding
  across light/dark themes, and automated normal-text contrast checks.
- Progress identifies the rolling seven-day window and achievement XP, links directly to
  history/achievements, and adapts its chart to large text. Locked achievements show rewards.
- Settings groups profile, language and preferences, saves age inline, serializes profile
  writes, and ties delayed account-delete confirmations to the initiating session.
- Older profile responses cannot roll back newly earned XP. A completed-and-paused daily
  task can resume on the same day without being completed twice.

## Verified so far

- Full root check: backend lint/build and 41 tests; mobile lint/typecheck and 62 tests.
- Real PostgreSQL: 23 transaction/concurrency/idempotency/forced-failure scenarios passed.
- Android debug: Home, task create/save with keyboard open, direct edit, history/back,
  paused empty state, profile, age save, dark theme. SQL confirmed edited title/age and
  unchanged 140 XP and ledger after those non-completion writes.
- iOS clean native Release and Debug compilation completed earlier. Xcode's UI test
  runner can open the development client and inspect actual native UI.

## Checks still in progress

- iOS auth and full product flows with a locally signed simulator build. An unsigned
  simulator build launches but does not have the Keychain entitlements needed for session QA.
- Android release reproduction of a debug-only inspector crash after changing system
  font scale. The recorded stack is CxxInspectorPackagerConnection; do not classify this
  as a verified production crash or ignore the release reproduction gate.
- Final native release builds, large-text checks and evidence consolidation.

## Gates for the final production audit

- Real deployment hostname, HTTPS, production secrets and PostgreSQL readiness.
- Backup/restore and migration sequence in ../DEPLOYMENT.md against staging first.
- Store signing, actual-device notification/avatar/keyboard checks, mail delivery and
  optional AI credentials. Simulator signing does not verify an App Store distribution build.
- Review inherited Expo dependency advisories; no forced major dependency upgrade was made.
- Persistent task/history reading after an offline cold restart is not implemented;
  retry/stale-data handling while the app is running is implemented.
