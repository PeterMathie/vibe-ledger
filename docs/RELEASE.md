# Android Beta Release

## Release boundary

The current beta is offline and has no Monzo or network path. Production builds
must not contain the synthetic transaction payload. `EXPO_PUBLIC_DEMO_MODE` is
a build-time switch:

- unset or `true`: developer/preview build; fixtures remain available;
- `false`: production build; Metro substitutes empty fixture arrays.

The EAS `production` profile explicitly sets `false`. The release verifier scans
the exported Android bundle for fixture markers. Do not weaken the resolver or
marker check to make a release pass. Preview builds explicitly opt in and must
be labelled and distributed as synthetic demos.

## Versioning

The permanent Android application ID is `app.vibeledger`. The marketing version
is kept equal in `package.json` and `app.json`. Increment `android.versionCode`
for every uploaded Android artifact, including rebuilds of the same marketing
version. EAS uses local, repository-controlled versioning.

OTA updates are disabled. An update therefore means installing a newly signed
APK/AAB over the existing package. This keeps schema migrations and installed
artifact contents coupled.

## Release checklist

1. Start from a clean, reviewed commit on `main`.
2. Update the marketing version and increment `android.versionCode`.
3. Update privacy, security, and third-party inventory when capabilities or
   dependencies changed.
   Confirm that iOS personal-data distribution remains disabled: no iOS backup
   exclusion has been configured or verified.
4. Run:

   ```sh
   npm ci
   npm run test:ci
   npm run typecheck
   npm run lint
   npm run format:check
   npm run doctor
   npm run licenses:check
   npm run security:check
   npm run release:check
   npm run export:android:production
   npm run verify:android:production
   ```

5. Build an AAB with `eas build --platform android --profile production`.
   To use the local EAS runner, add `--local`; it still uses `eas.json`.
6. Install the signed candidate on a clean Android device and complete the
   fresh-install checks below.
7. Install it over the previous signed beta and complete update-retention
   checks.
8. Record commit SHA, version/versionCode, CI run, EAS build URL, artifact
   checksum, tester/device, and checklist results in the GitHub release.
9. Publish to an internal/closed test track first. Promote the exact tested AAB;
   do not rebuild between testing and promotion.

## Signing

Production signing material must never be committed, placed in `.env` files,
attached to issues, or copied into CI logs/artifacts. Use EAS-managed Android
credentials or an encrypted organisation secret store. Restrict access to
release maintainers, enable account MFA, and keep an offline recovery record.

If using local credentials, keep `credentials.json`, keystores, aliases, and
passwords outside the repository. Verify the certificate fingerprint before
promotion. Losing the upload key requires the store's key-reset process;
losing an app-signing key can prevent trusted updates. Test recovery access at
least annually. This repository intentionally contains no real or placeholder
key.

## Fresh-install and update-retention plan

Test on the oldest supported Android API and one current API:

**Fresh install**

- install the production candidate with no prior app data;
- confirm startup and migrations succeed offline;
- confirm no synthetic transactions, subscriptions, or monthly budgets appear;
- attempt the visible demo action, if present, and confirm it creates no data;
- confirm app data is absent from Android backup/restore;
- create an export and confirm it shows the sensitive-data warning, uses the
  supported schema version, and contains no credential-like fields or opaque
  raw payload;
- restore that export and confirm representative data returns;
- attempt a malformed restore and confirm existing data remains unchanged;
- perform full wipe, restart, and confirm user/transaction data remains absent
  while built-in category metadata is reset;
- confirm standard screenshots and screen recording are blocked on financial
  screens, and confirm Android recent-app previews do not reveal app content;
- record the known iOS limitation separately when testing iOS: current capture
  protection does not replace the app-switcher snapshot with a privacy view;
- exercise the supported screen-reader and support flows while capture
  protection is active, recording any accessibility/support regression;
- background, force-stop, and restart without data loss or network access.

**Update retention**

- install the previous signed beta, create only synthetic-safe local state, and
  capture expected counts and representative classifications;
- install the candidate over it without clearing storage;
- confirm migration success, exact record/count retention, classifications,
  splits, rules, subscriptions, and historical monthly targets;
- restart offline and repeat representative aggregate/drill-down checks;
- export before upgrading, then verify that the same versioned export can be
  restored into a clean candidate install;
- confirm downgrade is not offered; rollback requires a compatible signed
  reinstall and restore from a deliberately retained export, and may still
  require uninstalling local app data.

A production release is blocked if either path fails. Never perform these tests
with personal bank data.

## Export, restore, and wipe release gate

Portable exports are sensitive financial files outside the app sandbox. They
are versioned and field-allow-listed, exclude credentials and opaque raw
payloads, and are not encrypted by the app. Release copy must warn users before
they save or share one.

Restore must reject unknown versions, missing/unknown fields, invalid monetary
values, credentials, and broken relations. It must replace local data in one
transaction and roll back entirely on failure. Full wipe must transactionally
remove all user and transaction data, reset built-in category metadata, and
survive restart. Wipe does not remove previously exported copies; this
limitation must remain visible in privacy copy.

The automated local-data tests cover schema validation, excluded payloads,
atomic rollback, round-trip restore, and wipe/restart. The signed-candidate
checks above cover the platform file picker/share destination and actual device
storage behaviour that unit tests cannot prove.
