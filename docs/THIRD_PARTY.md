# Third-Party Inventory and Update Policy

The lockfile is authoritative for exact installed versions. Direct dependency
ranges stay compatible with the selected Expo SDK.

## Runtime dependencies

| Package           | Purpose                                        | Data boundary                   |
| ----------------- | ---------------------------------------------- | ------------------------------- |
| `expo`            | Cross-platform application runtime and tooling | Composition layer only          |
| `expo-sqlite`     | Durable app-private relational storage         | Local raw and app-owned records |
| `expo-status-bar` | System status-bar presentation                 | No financial data               |
| `react`           | Component runtime                              | Presentation/composition only   |
| `react-native`    | Android/iOS UI runtime                         | Presentation/composition only   |

No analytics, crash-reporting, networking, authentication, advertising, or
generative-AI SDK is installed.

## Development dependencies

TypeScript and React types provide strict static checks. Vitest and V8 coverage
run pure domain and Node SQLite integration tests. ESLint with Expo's supported
configuration enforces code rules. Prettier provides deterministic formatting.
Expo Doctor validates SDK/configuration compatibility. Development dependencies
must not be imported by runtime source.

## Update policy

- `package-lock.json` is committed; CI uses `npm ci`.
- Dependabot checks npm and GitHub Actions weekly and groups development-tool
  updates.
- CI actions are pinned to immutable commit SHAs. Dependabot updates both the
  SHA and human-readable major-version comment.
- Dependency PRs run the full test, type, lint, formatting, Expo Doctor, and
  platform smoke checks appropriate to the change.
- Expo, React Native, React, SQLite, TypeScript, and major-version upgrades are
  reviewed for compatibility and are never auto-merged.
- Security advisories are assessed for runtime reachability and safe upgrade
  paths. Do not force a breaking downgrade merely to silence an audit.
- Remove unused dependencies promptly; prefer platform and standard-library
  capabilities over new packages.

The known Expo CLI build-time advisory and its current disposition are recorded
in `FOUNDATION.md`.
