# Security and Privacy Policy

This document owns implementation security and privacy controls. It does not
change the product or money model.

## Current data boundary

Phase 0 contains synthetic local fixtures only. Development builds, CI,
emulators, screenshots, and demos must never use personal bank data, Monzo,
OAuth, credentials, or tokens. There is no live network/auth path in the current
application.

Future source adapters may write immutable raw records through the persistence
boundary. They may not bypass classification or place source-specific shapes in
the domain model.

The interactive Demo Data importer writes only committed synthetic fixtures.
Every demo raw transaction and monthly budget it creates is recorded in an
ownership table. Reset deletes only those owned IDs and their app-owned
classifications/splits; it does not use a broad database wipe or delete
unrelated local records.

## Threat model and platform limits

- **OS/app sandbox:** app-private SQLite blocks ordinary cross-app access, but it
  does not protect an unlocked, rooted/jailbroken, compromised, or debug-enabled
  device. The app must not claim otherwise.
- **Device backups:** Android backup is explicitly disabled with
  `android.allowBackup=false`, so app-private financial data is not intentionally
  copied into Android cloud/device backups. Every release validates this on a
  physical-device fresh-install/restore path. No equivalent iOS exclusion is
  configured or verified. iOS backups may therefore include the app database
  according to platform and user settings. This blocks an iOS release that
  handles personal financial data until exclusion and restore behaviour are
  implemented, documented, and tested; it does not block the synthetic/offline
  Android beta.
- **Screenshots and recents:** the app applies `expo-screen-capture` protection
  globally to its financial surface. It blocks standard screenshots and screen
  recording and protects Android recent-app previews. On iOS, the current API
  does not provide an app-switcher privacy overlay, so the OS may still display
  its snapshot; a separate lifecycle-driven privacy view is required before
  claiming iOS app-switcher protection. Capture prevention reduces ordinary
  user control and can impede accessibility, support, casting, and assistive
  workflows. It also cannot protect against another camera, privileged
  accessibility/device management software, or a compromised device. These
  limitations and trade-offs are disclosed in `PRIVACY.md`.
- **Logs and diagnostics:** logs can escape the sandbox through development
  tools, crash services, or support bundles. Transaction descriptions, raw
  payloads, account identifiers, amounts, tokens, and database rows are never
  log fields.
- **Exports:** portable exports deliberately leave the sandbox and contain
  sensitive financial data, including allow-listed transaction fields,
  descriptions, amounts, classifications, rules, budgets, and subscriptions.
  The export carries an explicit warning and a versioned, exact allow-list. It
  excludes credential-like fields, tokens, non-synthetic source rows, and
  opaque raw payloads such as `raw_payload_json`; restore writes an empty
  payload rather than
  accepting one from the file. Exports are not app-encrypted, so the user must
  protect every saved or shared copy.
- **Restore and wipe:** restore validates the complete schema, fields, value
  types, currencies, timestamps, and embedded audit JSON before replacing
  data. Replacement runs in one database transaction and rolls back on any
  insertion or relational failure. Full wipe transactionally deletes local
  user/transaction records and resets built-in category metadata. It cannot
  revoke or erase export files already outside the sandbox.
- **Encryption and keys:** app-private storage is not equivalent to
  application-level encryption. Before personal data ships, document whether
  platform file encryption is sufficient. If database encryption is adopted,
  keys belong in platform secure storage with rotation, loss, backup, and
  recovery behaviour designed before implementation.

## Logging and errors

No production logger is introduced in Phase 0. Until a redacting logger exists:

- do not add `console.*` calls to application runtime code;
- user-facing errors are stable generic messages, never raw exceptions;
- errors may carry only allow-listed operational codes and synthetic-safe
  metadata;
- caught failures must not be silently converted into success;
- debug logging is permitted only for synthetic data and must not be enabled in
  release builds.

Startup follows this policy: a migration failure renders a generic unavailable
state and never prints or serializes the exception.

## Future Monzo boundary

The strict-local-first integration decision is in
`adr/0001-strict-local-monzo.md`. Tokens must use platform secure storage and
must never enter SQLite, logs, fixtures, source, screenshots, exports, or crash
reports. Any future broker requires a separate threat model and ADR before code
or deployment.

## Release data boundary

Production builds set `EXPO_PUBLIC_DEMO_MODE=false`. Metro substitutes an empty
fixture module, and CI scans the production Android export for known fixture
payload markers. Preview/development builds opt in explicitly and remain
synthetic-only. This prevents a production action from inserting committed demo
transactions while preserving a one-command developer demo.

The Android package ID is stable so signed updates preserve the app sandbox.
OTA updates are disabled; every update goes through the signed artifact and
migration retention plan in `RELEASE.md`.

Release checks must exercise export validation, atomic rollback, full wipe, and
post-wipe restart. Device testing must also verify the configured Android backup
exclusion. iOS personal-data distribution remains blocked by the unresolved
backup exclusion described above.
