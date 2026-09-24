# Third-Party Inventory and Update Policy

The lockfile is authoritative for exact installed versions. Direct dependency
ranges stay compatible with the selected Expo SDK.

## Runtime dependencies

### `expo-secure-store`

`expo-secure-store` is the only permitted persistence mechanism for a future
Monzo OAuth token. The adapter requests device-only, unlocked keychain
accessibility. It does not provide networking, receive transaction payloads, or
make live authorization available. Development and automated tests use an
in-memory implementation containing synthetic token strings only.

| Package                          | Purpose                                        | Data boundary                   |
| -------------------------------- | ---------------------------------------------- | ------------------------------- |
| `expo`                           | Cross-platform application runtime and tooling | Composition layer only          |
| `expo-screen-capture`            | Blocks screen capture on financial screens     | Presentation/privacy control    |
| `expo-sqlite`                    | Durable app-private relational storage         | Local raw and app-owned records |
| `expo-status-bar`                | System status-bar presentation                 | No financial data               |
| `react`                          | Component runtime                              | Presentation/composition only   |
| `react-native`                   | Android/iOS UI runtime                         | Presentation/composition only   |
| `react-native-safe-area-context` | System inset-aware screen layout               | Presentation only               |
| `react-native-svg`               | Local interactive allocation-ring rendering    | Presentation only               |

No analytics, crash-reporting, networking, authentication, advertising, or
generative-AI SDK is installed.

The interactive Demo Data, Home, and Explorer layer uses
`react-native-safe-area-context`, Expo's compatible system-inset primitive,
because React Native 0.86 deprecates its built-in `SafeAreaView`.
`react-native-svg` renders the local three-segment allocation ring; it performs
no I/O and receives only derived ratios. `expo-screen-capture` applies the
platform screen-capture protection for the app-wide financial surface; it does
not send captured content or financial data to a service. Navigation,
system-theme support, and accessible controls otherwise use the existing React
Native runtime.

## Development dependencies

TypeScript and React types provide strict static checks. Vitest and V8 coverage
run pure domain and Node SQLite integration tests. ESLint with Expo's supported
configuration enforces code rules. Prettier provides deterministic formatting.
Expo Doctor validates SDK/configuration compatibility. Development dependencies
must not be imported by runtime source.

## License inventory

The repository is distributed under the MIT License. Direct runtime packages
currently declare MIT-compatible licensing in their package metadata:

| Package                          | Declared license |
| -------------------------------- | ---------------- |
| `expo`                           | MIT              |
| `expo-screen-capture`            | MIT              |
| `expo-sqlite`                    | MIT              |
| `expo-status-bar`                | MIT              |
| `react`                          | MIT              |
| `react-native`                   | MIT              |
| `react-native-safe-area-context` | MIT              |
| `react-native-svg`               | MIT              |

Transitive metadata currently includes MIT, ISC, BSD, Apache-2.0, 0BSD,
BlueOak, MPL-2.0, CC0/CC-BY data packages, Python-2.0, and Unlicense terms.
`npm run licenses:check` validates installed lockfile metadata against this
reviewed allow-list and verifies that every direct runtime package appears in
this document. A new or unknown license blocks CI pending human review. Package
notices and license files shipped by dependencies remain authoritative; this
inventory is not a replacement for them.

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
- CI runs a high-severity production dependency audit and GitHub dependency
  review. Repository administrators should also enable Dependabot alerts,
  secret scanning/push protection, and private vulnerability reporting.
- Remove unused dependencies promptly; prefer platform and standard-library
  capabilities over new packages.

The known Expo CLI build-time advisory and its current disposition are recorded
in `FOUNDATION.md`.
