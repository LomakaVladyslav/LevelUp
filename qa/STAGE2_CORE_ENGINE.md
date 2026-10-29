# Stage 2 — Core Task Engine

Date: 2026-10-28. Base: `ba9a35ee518d09a11689e1d6a3bc6b3d0b17342e`, branch `upgrade/expo-sdk-54`.

Implementation is in the working tree. This is **not a fully validated Stage 2 acceptance**: PostgreSQL, HTTP integration and native build gates are blocked by this Work session's permissions. No production connection, migration, deployment or Stage 3 redesign was performed.

## Recovery after the interrupted Work session

Recovery on 2026-10-28 found the expected repository, branch and full baseline HEAD. There were 45 modified tracked files and 14 untracked files, with no staged files, index lock, merge, rebase or cherry-pick in progress. Every component named in the handoff was present, including the later 103-test mobile suite and 30-test persistence suite. There is no independent snapshot proving byte-for-byte completeness of the interrupted chat; no missing implementation component was found. No reset, clean, stash, checkout-overwrite or force-push was used.

Git reads work with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. A filesystem write-access check on `.git` returns `EPERM`; the session explicitly grants source writes but read-only Git metadata. GitHub lookup still fails with DNS resolution. No new commit or push was possible; source changes remain on disk.

Recovery fixes, without redesign:

- Track one-off due-date/timezone edits in schedule history and apply one-off edits immediately. Previously moving a DATE task away from today could leave today's old expectation in Today progress. Recurring edit/resume timing remains tomorrow.
- Route Undo reminder reads through the existing data-revision guard. Add the same protection to language-change, notification-enable and root reconciliation reads so a later task mutation wins over a stale response.
- Retain cold-start notification responses until the navigation container reports readiness. Both ready/state events drain the pending response; account/session guards and deduplication still apply.
- Align the new CompletionUndo foreign key with Prisma's `ON UPDATE CASCADE` expectation.
- Add one backend handler regression and five mobile regressions for these cases. Existing XP rollback and manual/overflow goal contribution fixes were present and retained.

Latest checks: backend socket-free suite **61/61**, mobile **108/108 across 16 suites**, both lint/typechecks, Prisma validation and fresh Android/iOS Hermes exports pass. Full backend-suite results are recorded below. PostgreSQL 18 bootstrap was retried once in `/tmp/levelup-recovery-pg` and failed at `shmget`; initdb removed its incomplete cluster. The isolated `levelup_recovery_test` suite invocation then failed with P1001 before migration/tests. Fresh npm audits fail with `ENOTFOUND registry.npmjs.org`. Expo Doctor remains 16/18 with its remote checks unavailable. Native dependencies/configuration are unchanged, so the prior isolated Android prebuild was not repeated.

## Environment and Git

- The original Stage 2 session started clean; recovery started with the preserved dirty tree described above.
- Cached `origin/upgrade/expo-sdk-54` also points at `ba9a35e`. Live `git ls-remote` failed with `Could not resolve host: github.com`; the current remote tip is unverified.
- Git works with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. The first default Git invocation encountered the Xcode license gate; later `xcodebuild -checkFirstLaunchStatus` succeeded. No license was accepted by this agent.
- Colima is stopped. Starting it failed writing `~/.colima/default/colima.yaml` (`Operation not permitted`).
- A separate PostgreSQL 18 cluster was attempted with `/Library/PostgreSQL/18/bin/initdb -D /tmp/levelup-stage2-pg -U levelup_test --auth=trust --no-locale -E UTF8`. Bootstrap failed at `shmget` with `Operation not permitted`; initdb removed the incomplete cluster.
- `TEST_DATABASE_URL=postgresql://levelup_test@127.0.0.1:55432/levelup_stage2_test npm run test:db` failed with P1001. No migrations were applied to any database. Neither the original 23 PostgreSQL tests nor the expanded 30-test suite could execute.
- `git add` failed creating `.git/index.lock` (`Operation not permitted`). **No commits and no push.** HEAD remains the baseline and all Stage 2 changes are uncommitted. The session grants source-file writes but makes `.git` read-only. No permission bypass or force-push was attempted.

## Product behavior

Only `title` is required by create API. `CUSTOM` and `SIMPLE` are defaults; supplying a date without an explicit schedule selects `DATE`. Description and category remain optional. Time requires a date or recurrence; the form hides time for Anytime tasks.

`PlannedActivity` remains the single task/habit model. `DAILY` repeats each calendar date; `WEEKLY` stores distinct JS weekdays (0=Sunday through 6=Saturday). Monday-Friday is `[1,2,3,4,5]`. The UI exposes selected weekdays, the preset and a CUSTOM default without requiring category selection.

No occurrence rows or overdue copies are generated for missed days. Completion is permitted only for today's scheduled date in the task's stored IANA timezone. A 20-day absence produces one currently actionable occurrence, not 20 overdue tasks. Non-scheduled dates are disabled in Tasks and excluded from Home's next actionable task.

### Schedule history, pause and streak

A server-owned JSON schedule history stores effective local date, recurrence, weekdays, pause state, reminder time/date and timezone. Creation establishes today's revision. Recurring edits and resume start **tomorrow**; pause applies **today immediately**. One-off date/time edits apply immediately. Multiple edits for the same effective date coalesce. Completed history is preserved, including a completion before a same-day pause.

Habit streak scans the historical scheduled dates, independent of the user's global streak. Incomplete today has a grace period until its calendar day ends. An earlier uncompleted scheduled date breaks the chain; off-days and paused dates do not. Thus Mon/Wed/Fri completions produce a streak of 3. No cross-task global count is used.

Established recurring series retain their timezone and remain recurring (daily/weekly changes are supported). Converting them to a one-off or changing their timezone is rejected to preserve date identity. Device timezone changes do not silently move a task's schedule. These are explicit v1 implementation constraints, not a new navigation/product concept.

## Database and API

Migration: `levelup-backend/prisma/migrations/20261028000000_core_task_engine/migration.sql`.

- Adds `WEEKLY` enum value, `PlannedActivity.weekdays`, `scheduleHistory`.
- Adds `Activity.streakDate` and `goalContributions`.
- Adds `CompletionUndo` tombstones, retained independently of the removed Activity and cascading with the owning account.
- Adds `Goal.progressVersion` and `progressBaseCount` for manual progress and exact completion attribution.
- Converts legacy SIMPLE tasks with reminder times to DATE using their original `updatedAt` calendar anchor; it does not move expired reminders to the next app launch.
- Reconstructs legacy goal attribution deterministically while preserving each goal's current count: latest qualifying completions are attributed up to that count, and the remainder is a manual baseline.

Existing planned-activity endpoints accept weekdays and default the category. List responses expose `occurrenceDate`, `effectiveSchedule`, `isScheduledToday`, completion state and per-task streak. Completion accepts `completionDate` and `updatedAt`; the app sends both for recurring tasks. A stale date or task version is rejected.

New endpoint: `POST /api/activities/:id/undo`, authenticated, owner-scoped, using `Idempotency-Key` and the existing user row lock / transaction / mutation receipt machinery.

## Completion and Undo

The existing completion transaction and unique `(userId, plannedActivityId, completedForDate)` constraint remain. Every recurring completion is tied to one scheduled local date. Duplicate requests cannot award XP, streak or achievements twice. Global streak dates are separately captured from the request timezone so Undo can replay them accurately for new completions.

Undo atomically:

1. Validates ownership and creates a durable completion tombstone.
2. Removes precisely that Activity (including translations), reopening an existing completed one-off plan.
3. Writes a negative XP compensation at the completion's original timestamp, so day statistics roll back too. New completion XP is timestamped at the same instant.
4. Recomputes affected goals from remaining attributed completions and the manual baseline. Later manual edits have a new progress version and are preserved. Later qualifying completions can keep a goal complete even after an earlier completion is undone.
5. Replays remaining completion history for global streak, achievements and reward XP; habit streak is derived from the remaining occurrence history.
6. Stores the Undo response in the same transaction.

Achievements use a deterministic least-fixed-point replay in completion order. A reward cannot qualify itself using only its own XP. Rewards with no remaining qualifying evidence are removed; rewards supported by later completions survive. XP of other completions is never retroactively changed. Non-achievement XP without surviving Activity evidence is retained from the XP ledger.

A repeated Undo without a request key is a no-op via the tombstone; an old Undo never affects a later recompletion. A replay of the original completion receipt after Undo returns `COMPLETION_UNDONE`, preventing a false client-side resurrection. Recompletion uses a new Activity ID. Ordinary history archive/delete behavior is unchanged.

Mobile exposes Undo in the completion banner and history details. Retry keys persist through uncertain network outcomes. XP comes from a current authoritative profile refresh, accepting lower totals; late profile-save responses cannot restore revoked XP. Account/session guards remain in place.

## Reminders

- One non-repeating native DATE notification per scheduled occurrence on both platforms. Legacy daily/repeating schedules are cancelled during reconciliation.
- A 31-calendar-day candidate window; nearest occurrences are selected with a cap of **256 on Android / 60 on iOS**. Ten daily Android tasks get approximately 25 days rather than six. iOS remains capacity-limited (about six days for ten daily tasks).
- Reconciliation runs at launch, foreground, data/language/settings changes and once per minute while active. Focused task data refreshes across midnight in task timezones, including zones different from the device.
- Completed today is omitted. Pause/deletion cancels reminders; schedule edits cancel old requests before reading authoritative completion metrics. Undo reconciles remaining schedules. Network failure after an edit leaves obsolete reminders cancelled, with renewal retried on foreground/active reconciliation.
- The notification toggle controls task reminders. No separate daily motivational prompt is scheduled. Actual system permission and a disabled Android reminder channel are reflected in settings, with a system-settings action.
- Notification response handling covers initial/cold-start and live taps, deduplicates delivery, validates owner/task ID, waits for root navigation readiness and opens the specified task. Old-session responses cannot navigate another account.
- Task timezone is fixed; winter/summer offset, midnight, date-line zones and ambiguous/nonexistent DST times are tested. Spring-forward nonexistent wall times are skipped; fall-back ambiguity selects one instant, never two reminders.
- Logout and account deletion cancel scheduled and displayed notifications. Queued jobs are guarded by session and notification generation.

Reference checked for initial and live notification-response routing: https://docs.expo.dev/versions/latest/sdk/notifications/ . Implementation uses the installed SDK 54 types/APIs, not newer-version API assumptions.

## Validation

| Check | Result |
| --- | --- |
| Backend lint | Pass |
| Backend TypeScript / Prisma client generation | Pass |
| Backend full suite | 86 tests: 62 pass, 24 fail at HTTP listener setup due to `listen EPERM`; no assertion failure in executed domain tests |
| Socket-free backend services/utils + new handler contracts | 61/61 pass after recovery fixes |
| PostgreSQL persistence | Blocked before tests (P1001); suite expanded from 23 to 30 |
| Mobile lint / typecheck | Pass |
| Mobile tests | 108/108, 16 suites; run with `--watchman=false` |
| Expo Doctor | 16/18; config schema and React Native Directory requests blocked by DNS/network |
| Backend and mobile npm audit | Both unavailable: npm registry `ENOTFOUND`; do not treat this as an audit pass |
| Android / iOS production Hermes exports | Pass, HTTPS placeholder API origin, output only in `/tmp` |
| Android native prebuild | Pass in an isolated `/tmp` copy |
| Android Release Gradle | Cannot start: `FileLockContentionHandler` throws `java.net.SocketException: Operation not permitted` |
| iOS native build / physical-device notification delivery | Not verified in this session |
| Diff whitespace / artifact check | Pass; no `.env`, secrets, lockfile dependency changes, native directories or build outputs included |

### Migration preflight (no database writes)

- `prisma validate --schema prisma/schema.prisma` passed with an explicit localhost test-only DATABASE_URL.
- Generated SQL with `prisma migrate diff --from-schema-datamodel /tmp/levelup-recovery-base.prisma --to-schema-datamodel prisma/schema.prisma --script`, using the Stage 1 schema extracted read-only from HEAD. Also generated the full schema from empty without a database. Neither command applies migrations.
- All enum, column, table, primary-key, index and relation additions are accounted for. The foreign-key update action was corrected as described above. The handwritten migration additionally enforces `weekdays NOT NULL`; Prisma's generated array DDL omits that database constraint. Both provide an empty-array default; the explicit stronger constraint prevents SQL NULL arrays.
- The existing unique `(userId, plannedActivityId, completedForDate)` occurrence identity and Activity-to-plan `ON DELETE SET NULL` relation are preserved. Undo tombstones intentionally have no Activity foreign key, so they survive deletion and recompletion; they cascade with User.
- WEEKLY is added without being used in data statements in the same migration. Existing records receive empty weekdays/history/contributions defaults. Legacy DAILY schedules are interpreted through the existing fallback; new history revisions preserve future edits and pauses.
- Reviewed the streakDate backfill, legacy time-only reminder date conversion and deterministic goal-attribution CTE. Existing completion rows and XP are retained. Legacy goals preserve their current count by splitting attributed completions and manual baseline. Prior unrecorded schedule/manual-edit history cannot be recovered.
- Structural changes are additive, but this is not a safe mixed-version write rollout: old backend writers do not maintain schedule history or goal contributions. Apply/test migration before starting the Stage 2 backend; stop old writers during transition. Stage 2 mobile requires the Stage 2 API for WEEKLY and Undo. No production migration or rollback was performed.
- Still required on an isolated PostgreSQL database: migrate a populated Stage 1 fixture (active/paused daily tasks, time-only tasks in multiple zones, completions, partially/fully/manual-progress goals), assert preserved row counts/XP/progress and new defaults, then test Undo and compare the live schema. SQL parsing/execution and data-backfill correctness are **not** proven by Prisma schema validation alone. Do not treat the blocked 30-test persistence suite as a populated-migration test.

New backend tests cover schedule revisions, daily/weekly/preset, pause/resume, no backlog, timezone/date boundaries, habit streak, deterministic reward replay, XP/global streak/goal rollback, duplicate/foreign Undo, stale completion receipts and direct handler validation. New PostgreSQL tests cover weekly concurrent completion, stale edits, transactional Undo/retry, foreign ownership, recompletion, and forced Undo write rollback. The pre-existing avatar persistence test was aligned with Stage 1 authenticated access.

New mobile tests cover title-only and weekly creation, Undo UI/retry/account switching, authoritative XP rollback, stale profile responses, notification cold-start/live routing, permission/channel denial, completion/edit/undo reminder state, rolling capacity and stale-session reconciliation.

## Remaining acceptance gates and limitations

1. Run the complete 86-test backend suite and 30 PostgreSQL tests in an environment allowing local sockets/shared memory. Test a populated Stage 1 fixture through the migration, including legacy goal attribution, before any production rollout.
2. Obtain fresh npm audit results and both remote Expo Doctor checks. Dependencies/lockfiles are unchanged; Stage 1's 0 backend findings and 4 mobile package findings / 2 advisories are historical only.
3. Run native release/device QA: foreground/background delivery, notification taps after process death, timezone travel, permissions/channel settings, DST, reboot, logout and account deletion. Android's installed Expo scheduler falls back to inexact alarms without exact-alarm access; OS power management can delay delivery. No new exact-alarm permission/push system was introduced.
4. Local notifications cannot replenish while an app never runs. More occurrences than platform capacity shorten coverage; iOS is still about six days with ten daily tasks. A long absence has no guaranteed reminders after that window. The UI tells users to reopen regularly.
5. Stage 1 did not retain old schedule edits/pause intervals or the timezone header of every global completion. New records are exact. Legacy global date reconstruction uses `completedForDate` (UTC completion date as fallback); legacy goal attribution is deterministic rather than a claim to recover unavailable manual edit history. Current legacy disabledAt is honored; older unrecorded pauses cannot be reconstructed.
6. New task-engine UI text is Ukrainian/English; other existing locales currently use English for these new labels.
7. Restore writable Git metadata/network, review the diff and create thematic commits/push without force. Suggested grouping: backend recurrence/schema; transactional Undo and tests; mobile task/reminder/Undo UX and tests; validation handoff.

Stage 3 was not started. The implementation is available for review, but Stage 2 should not be signed off or described as release-ready until the blocked validation gates pass.
