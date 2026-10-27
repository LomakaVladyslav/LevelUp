# Safe LevelUp releases

## Scope and prerequisites

Backend: Node 22, Express 4, Prisma 5, PostgreSQL 16. Mobile: Expo SDK 54,
React Native 0.81, React 19. Use the committed lockfiles with `npm ci` in each
subproject. Mobile's `.npmrc` records its existing peer dependency policy.
`render.yaml` is a staging configuration, not a durable production environment.
For daily use, provision a persistent PostgreSQL service with backups, tested
restore, sufficient connections and an always-on API. Do not store daily user
data in a database that expires or is routinely recreated.

Required server environment:

- `DATABASE_URL`: the intended PostgreSQL database; use TLS outside a trusted
  private network. Set `connection_limit`, `pool_timeout=5`, `connect_timeout=5`
  for Prisma, and size the pool across all service replicas.
- `JWT_SECRET`: a stable random secret of at least 32 characters. Keep it across
  releases; rotating it signs everyone out. Never put it in mobile/EAS public variables.
- `NODE_ENV=production`, a supported Node 22 runtime, and `PORT` supplied by the host.
- `TRUST_PROXY_HOPS`: only the number of trusted proxies in the actual ingress
  path (`1` in the supplied Render configuration). Multiple replicas need a
  shared ingress rate limit; the in-process guard is not a distributed quota.
- SMTP host/port/security/user/password/from and `PASSWORD_RESET_URL_BASE` pointing
  to `https://YOUR_API/reset-password`. `PASSWORD_RESET_APP_URL_BASE` defaults to
  `levelup://auth/reset-password`. Without SMTP, reset requests return a clear
  unavailable error; tokens and reset links are not logged.
- `OPENAI_API_KEY` is optional for core tasks. Missing AI configuration gives a
  recoverable unavailable response. `OPENAI_MODEL` is configurable.
- `UPLOADS_DIR` is needed only for legacy file avatars or their migration. New
  avatars live in PostgreSQL and are covered by its backup.

Mobile: `EXPO_PUBLIC_API_BASE_URL=https://YOUR_API` (optional `/api` suffix).
Only public values belong in `EXPO_PUBLIC_*`. Production rejects an absent URL,
HTTP, credentials in the URL, query strings or an unrelated path. A bundle made
with `https://levelup.example.test` is for build verification and must not be
shipped to users.

## Release order

1. Run `npm run check` at repository root and `npm run test:db` against a dedicated
   database whose name ends in `_test`. Export/build both mobile platforms using
   the intended HTTPS API origin. Smoke-test a freshly installed native build.
2. Take a PostgreSQL backup or recovery snapshot and verify restoration into a
   separate database. Retain any old `uploads/avatars` files. Record the current
   server version and mobile API configuration.
3. Run `npm --prefix levelup-backend run audit:data` against the deployment DB.
   Exit code `2` means discrepancies require review. The command only reads:
   it reports XP/ledger differences, missing legacy activity history, invalid
   counters and file-backed avatars, with at most 100 sample user IDs per category.
   Old partial writes and permanently deleted history cannot be reliably repaired
   by guessing; use the original ledger/backups and review the intended correction.
4. For this first transactional release, briefly pause writes/drain the old API
   workers. The old code does not acquire the new user locks. Do not run old and
   new mutation handlers concurrently and assume they share the new guarantees.
5. From the new backend artifact, with the correct DB selected, run:

   ```sh
   npm run generate
   npx prisma migrate deploy --schema prisma/schema.prisma
   npm run seed
   npm run audit:data
   ```

   Run migration/seed once per release, before routing traffic. The new migrations
   add columns/tables/constraints without resetting user data. `NOT VALID` checks
   preserve legacy rows while enforcing constraints on future writes. Never use
   `prisma migrate reset` or `db push --accept-data-loss` on shared data.
6. If file avatars exist, run `npm run migrate:avatars` on the server that still
   holds them. Review the dry-run output, then run `npm run migrate:avatars -- --apply`.
   It reads valid JPEG/PNG/WebP files up to 2 MB, locks each user, rechecks the old URL,
   and atomically saves bytes plus the new profile URL. Missing/invalid files are
   reported, original files remain intact, and repeated execution is safe. Copy
   retained legacy files to the new host if migration could not cover them.
7. Start the new API, check `/health`, then use a disposable account to register,
   create/retry/complete a task, reload history and totals, change an avatar, and
   sign in again. Test actual SMTP delivery separately. Resume writes after these
   probes pass. Allow in-flight requests to finish during subsequent shutdowns.
8. Release the new **native** mobile binary. SecureStore, Crypto and ImageManipulator
   were added: an OTA-only update to an old binary is insufficient. Validate cold
   start, saved-session migration, logout/relogin, offline errors, reminders,
   password reset links, font scaling and both themes on physical iOS and Android.
9. Monitor API failures/latency, database connections/locks, backup status, and
   repeated client retries. Run the data audit after release.

## Recovery and operational semantics

If mobile rollout fails, pause it while retaining the new backend and additive
schema. If server code must be rolled back, stop writes first: an older writer
reintroduces partial-write/race risks. Prefer a forward fix. Do not roll back the
whole database over newer successful writes; restore into a separate DB for
inspection/recovery. Do not drop receipt/avatar tables during code rollback.

Mutation receipts commit with the operation and replay its original response.
A timeout means the result is uncertain, not that the write failed. The mobile app
persists its idempotency key before sending and keeps it for explicit retries.
Do not truncate receipts casually: there is currently no agreed expiry for retry
keys. Account deletion cascades to receipts, avatars and personal data.

Deleting an activity from history archives it; earned XP, streak evidence and
achievement history remain consistent. Deleting a plan preserves completed
activity history. Account deletion remains a separate destructive action.

Task reminders use the task's timezone. iOS repeats daily notifications with an
IANA calendar trigger; Android schedules a rolling month of dated notifications,
refreshed on opening/foreground. At most 60 task reminders are pending, prioritizing
nearest dates. The separate 09:00 daily prompt follows device time. Permissions,
Android battery settings and OS delivery behavior still require physical-device QA.
