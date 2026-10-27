# LevelUp local development

Use Node 22 and a local PostgreSQL database. Install from the committed lockfiles:

```sh
npm --prefix levelup-backend ci
npm --prefix levelup-mobile ci
```

Copy each subproject's `.env.example` to its local `.env`, filling in real local
values. Do not commit credentials. The server requires a database and a JWT secret
of at least 32 characters. Configure SMTP only if testing email reset, and OpenAI
only if testing AI features.

Prepare a new local database and start the server:

```sh
cd levelup-backend
npm run generate
npx prisma migrate deploy
npm run seed
npm run dev
```

For a physical phone, set the mobile URL to `http://YOUR_LAN_IP:3000` and use the
same Wi-Fi network. For the Android emulator, use `http://10.0.2.2:3000`; for iOS
Simulator, `http://localhost:3000`. `/api` is appended automatically. Verify `/health`
from the device. An Expo tunnel forwards the bundler, not the backend.

```sh
cd levelup-mobile
npm run start:clear
```

Use an updated native development build after changing native modules or plugins.
Expo Go does not replace release testing of secure storage, notifications and
platform permissions. Use `npm run android:dev` / `npm run ios:dev` when the SDK,
device/simulator and native tooling are installed.

All automated checks:

```sh
npm run check
```

Real PostgreSQL tests use a separate disposable DB and deliberately force errors
and terminate a transaction connection. Never point them at a shared database:

```sh
docker run --rm --name levelup-test-db -e POSTGRES_PASSWORD=levelup-test-only -e POSTGRES_DB=levelup_test -p 127.0.0.1:55432:5432 -d postgres:16-alpine
TEST_DATABASE_URL=postgresql://postgres:levelup-test-only@127.0.0.1:55432/levelup_test npm run test:db
docker stop levelup-test-db
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for migration order, backups, legacy data audit,
avatar migration, production configuration and release verification.
