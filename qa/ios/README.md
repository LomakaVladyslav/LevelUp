# Native iOS product checks

These XCTest checks control the installed LevelUp app through its native UI. They
are separate from Jest. Run them only with an isolated local smoke-test database:
the fixture account is public test data and the flows create/complete tasks and
change its profile preferences. Never connect this harness to production.

## Prerequisites

1. Start the backend on `127.0.0.1:3301`, using a migrated and seeded
   `levelup_smoke_test` PostgreSQL database. Use a dedicated test JWT secret.
   See the root deployment/local-development guides for migration commands.
2. Run `node qa/ios/seed-local.cjs`. This registers/logs in the dummy account and
   creates an initial history entry if needed; it does not print authentication tokens.
3. Install a **locally signed** Debug simulator app with bundle ID
   `com.vladyslav.levelup`. Keychain/session testing requires working signing
   entitlements. Start its development client on Metro port 8082 with
   `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3301`.
4. Select English and boot the intended simulator. Use the simulator's actual ID
   in the commands below. Keep app sources unchanged while a UI test is running.

## Generate and run

With Ruby's `xcodeproj` gem available (also installed by CocoaPods):

```sh
ruby qa/ios/setup.rb /tmp/levelup-product-ui-tests
xcodebuild test \
  -project /tmp/levelup-product-ui-tests/LevelUpProductQA.xcodeproj \
  -scheme LevelUpProductQA -destination 'id=SIMULATOR_ID' \
  -derivedDataPath /tmp/levelup-product-ui-derived \
  -resultBundlePath /tmp/levelup-product-normal.xcresult \
  CODE_SIGNING_ALLOWED=NO -parallel-testing-enabled NO -jobs 1
```

The test runner itself is unsigned; the app under test must retain its Keychain
entitlements. Use a new result path for each run. Regenerate after editing Swift.
Tests preserve screenshots and native accessibility trees in their result bundle.
The task flow creates a uniquely named daily task each time and verifies edit,
double completion, menu/alert transitions, pause, process restart, resume and history.
The screen flow checks keyboard actions, profile editing, themes, navigation,
logout persistence, login and session restoration.

## Large text and accessibility

```sh
xcrun simctl ui SIMULATOR_ID content_size accessibility-extra-large
# Repeat testScreensFormsThemesAndSession (and inspect its screenshots).
# Restore the original setting when finished; the usual default is "large":
xcrun simctl ui SIMULATOR_ID content_size large
```

The native sufficient-element-description audit checks accessibility metadata.
It does **not** establish VoiceOver focus order, spoken output or gesture usability.
Complete those checks on a physical iPhone with VoiceOver enabled. A passing
Simulator audit must not be reported as a real VoiceOver pass.

Exact run results and remaining limitations are recorded in `../PRODUCT_QA.md`.
