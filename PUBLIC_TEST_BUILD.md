# Public Test Build

This project needs a public backend before an iOS build can be shared with testers.
The mobile app must receive the backend origin through `EXPO_PUBLIC_API_BASE_URL`
without `/api`; `levelup-mobile/services/api.ts` appends `/api`.

## 1. Deploy the staging backend

The root `render.yaml` defines:

- `levelup-backend-staging`: Node web service from `levelup-backend`
- `levelup-postgres-staging`: Render Postgres database
- build: `npm ci --include=dev && npx prisma generate --generator client && npm run build`
- pre-deploy: `npx prisma migrate deploy && npx prisma db seed`
- health check: `/health`

Deploy it from Render Dashboard:

1. Push this repo branch to GitHub.
2. Open Render Dashboard > New > Blueprint.
3. Connect `https://github.com/LomakaVladyslav/LevelUp`.
4. Use the repo root `render.yaml`.
5. Fill required secret values:
   - `OPENAI_API_KEY`
   - `PASSWORD_RESET_URL_BASE`, for example `https://levelup-backend-staging.onrender.com/reset-password`
6. Optional, if real password reset emails should work:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`

After deploy, verify:

```bash
curl https://YOUR_RENDER_BACKEND_DOMAIN/health
```

Render free Postgres is suitable only for short staging. As of Render's current
docs, free Postgres databases expire after 30 days; use `basic-256mb` or higher
for persistent testing data.

Avatar uploads currently use the service filesystem under `uploads/`. On a free
Render web service, uploaded files are ephemeral and can disappear after restart
or redeploy. This is acceptable for staging smoke tests, but production should
move avatars to object storage or a paid persistent disk.

## 2. Configure EAS environment variables

Create the public API origin in EAS. Do not add `/api`.

```bash
cd /Users/vladyslav/Projects/levelup/levelup-mobile
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR_RENDER_BACKEND_DOMAIN --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR_RENDER_BACKEND_DOMAIN --visibility plaintext
```

The `preview` EAS build profile uses the EAS `preview` environment. The
`production` profile uses the EAS `production` environment.

## 3. Build iOS

For TestFlight:

```bash
cd /Users/vladyslav/Projects/levelup/levelup-mobile
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

For EAS internal distribution instead of TestFlight:

```bash
cd /Users/vladyslav/Projects/levelup/levelup-mobile
npx eas-cli device:create
npx eas-cli build --platform ios --profile preview
```

iOS internal builds only install on devices included in the ad hoc provisioning
profile. Register friends' iPhones before creating the build.

## 4. Acceptance checks

- `curl https://YOUR_RENDER_BACKEND_DOMAIN/health` returns JSON with `status: ok`.
- Register and login from an iPhone outside your local Wi-Fi.
- Create a planned activity and complete it.
- Open achievements, stats, AI recommendations, and profile avatar upload.
- Confirm requests go to `https://YOUR_RENDER_BACKEND_DOMAIN/api/...`, not
  `192.168.x.x`.
