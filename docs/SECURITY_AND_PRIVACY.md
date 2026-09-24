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
- **Device backups:** platform backup settings can copy app-private files.
  Before personal data ships, backup inclusion/exclusion and restore behaviour
  must be explicitly configured and tested per platform.
- **Screenshots and recents:** financial screens can be captured by users, OS
  recents previews, accessibility services, and device management software.
  Sensitive-screen protection and its usability trade-offs require a UI-stage
  decision; synthetic screens need no such restriction.
- **Logs and diagnostics:** logs can escape the sandbox through development
  tools, crash services, or support bundles. Transaction descriptions, raw
  payloads, account identifiers, amounts, tokens, and database rows are never
  log fields.
- **Exports:** exports deliberately leave the sandbox. Future export/restore
  requires explicit confirmation, a versioned allow-listed schema, integrity
  validation, atomic restore, clear destination warning, and no credentials or
  opaque raw table dump.
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
