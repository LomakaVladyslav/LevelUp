# Stage 1 security decisions — 2026-10-27

## Dependency review

Baseline audit: backend 5 (4 high, 1 critical); mobile 17 (8 moderate, 8 high, 1 critical). This counts npm package findings, not distinct exploitable application defects.

Backend now has zero audit findings after updating body-parser, proxy-addr, multer, nodemailer and brace-expansion. body-parser handles public request bodies (reachable DoS). Multer uses memory storage and a synchronous file filter, so the reported disk/async-filter paths are not used, but the patch is applied. Numeric proxy hop trust does not use the vulnerable subnet matching path. Nodemailer uses one configured SMTP service and fixed templates; user email addresses reach the address parser. Upgrade 9→10.1.4 requires Node >=20 (project runs Node 22); mail rendering is tested using the real stream transport with no delivery. No DKIM or arbitrary attachment content is used. brace-expansion is tooling only.

Mobile updated compatible transitive versions: brace-expansion, compression, fast-uri, follow-redirects, node-forge, shell-quote, source-map-js, undici, zod and React Navigation core/routers. These are mostly development/build tooling, despite being under Expo's production npm dependency tree. follow-redirects is Axios's Node adapter; native uses XHR. The xcode-only uuid override to 11.1.1 retains the CommonJS v4 API; Xcode project ID generation was checked. No Expo/RN/native module version changed.

Remaining **4 package findings, 2 underlying advisories**:
- `decode-uri-component` moderate, inherited through query-string / expo-router. Malformed percent-encoded deep-link/query input can reach decoding (runtime reachable). Fixed 0.5.1 is ESM; query-string 7 expects a callable CommonJS export. Do not force-override. Requires a reviewed compatible backport or Router/SDK upgrade and deep-link regression tests before public release.
- `image-size` high in Metro. Host-side asset parser DoS, not native application runtime; repository images are currently trusted. Fixed 2.x drops synchronous filename input used by Metro. Do not force-override. Resolve with compatible Metro upgrade/backport before release build pipeline is considered hardened; do not process untrusted assets meanwhile.

No audit fix --force, SDK downgrade, native dependency upgrade, production migration, or deployment was performed. npm audit is a known-advisory check, not proof that software has no vulnerabilities.

## Implemented controls

- AI: backend chat returns `503 AI_DISABLED` before reading profile context or constructing a provider client; both personal-text localization entry points return original content even if a provider key and cached translations exist. Provider helper also fails closed. Mobile AI entry is removed, deep link redirects, service refuses calls. Code/schema retained for future consent-based design.
- Avatars: database UUID and legacy avatar requests require a valid session and matching owner; unknown/foreign files return 404; directory static hosting removed. Private images use no-store headers. Mobile sends bearer headers only to controlled same-origin avatar routes. Avatar preparation checks the initiating session before uploading; deletion/profile updates explicitly bind the bearer token.
- Local deletion: per-owner draft queue blocks stale writes immediately; durable pending cleanup marker supports restart retry; session removal retains owner evidence until legacy credentials are cleared. Old deletion responses cannot clear a new session. Scheduled and delivered notifications are cleared, late permission results cannot re-enable them, daily preference resets. Logout preserves drafts. Language/theme are device preferences and retained. Mutation keys hold hashes/UUIDs, not task payloads, and are retained to preserve uncertain retry semantics. There is no persisted task-response cache in the current application; screen resources mask data belonging to another owner.
- Age collection removed from Settings (registration already did not collect it). Schema and historic values retained.
- Auth: tests cover expiry/signature, sessionVersion revocation (including lock-time recheck), deletion and 401/503 behavior. Password reset continues to invalidate existing sessions. Database availability failures map to 503. Missing account after auth validation maps to 401. Existing reset-token transactional consumption is retained.
- Logs: raw error objects removed from remaining application logging; mobile logs only HTTP method/status; request metrics log route templates instead of actual IDs/paths/query strings.

## Validation and remaining gates

2026-10-27 baseline: backend 41 tests, mobile 62 tests; lint/typecheck/build passed before baseline commit.
Stage 1 final: backend 55 tests passed; mobile 76 tests in 13 suites passed. Backend ESLint/TypeScript build and mobile ESLint/typecheck passed. Expo install compatibility check and Expo Doctor passed (18/18). Android/iOS Metro + Hermes export succeeded using `https://example.invalid/api` as a non-secret placeholder: these are smoke bundles, not installable release binaries.

No native module versions changed. Native Android/iOS builds were not run in Stage 1. Existing local Xcode requires license acceptance; this was not changed. Actual-device avatar, OS notification cleanup and lifecycle QA remain required before release. SMTP rendering was tested locally, not actual email delivery.

PostgreSQL persistence suite (23 tests) was not run: no listener at localhost:55432 and Docker/Colima daemon socket absent. Only mocked database integration tests ran this turn. No production database read, write or migration was performed by Stage 1. Existing baseline migrations remain unchanged.

One intermediate full backend run returned an unexpected 401 instead of 400 in the invalid reset-token test. A focused auth/avatar rerun and subsequent full suite passed; no reproducible cause was found. Preserve this observation if the failure recurs in CI. A test command invoked from the monorepo root lacked the backend tsconfig and failed to load CommonJS; the same test passed from levelup-backend. Early Expo checks could not write the user's Expo cache; the authorized rerun passed. These are not final failing checks.

Public release remains blocked by the two dependency advisories above, persistence validation in an isolated running database, real-device QA, and the later release roadmap. Stage 2 product work can proceed from this tested baseline; Stage 1 is not a store-release approval. No Today/navigation/repeats/Undo/XP redesign was implemented.
