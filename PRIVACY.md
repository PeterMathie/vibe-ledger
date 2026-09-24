# Privacy Notice — Beta

Vibe Ledger's current beta runs locally and contains no Monzo connection,
network sync, advertising, analytics, or crash-reporting SDK. It processes only
data the user places on the device. The distributed evaluation build has demo
fixtures removed; explicitly labelled demo builds contain synthetic records
only.

App data is stored in the operating system's private application storage. This
reduces ordinary cross-app access but does not protect an unlocked,
rooted/jailbroken, compromised, or debug-enabled device. Android backup is
disabled in application configuration. No equivalent iOS backup exclusion is
configured or verified, so an iOS device backup may include app data according
to the user's operating-system and backup settings. This blocks release with
personal financial data on iOS until exclusion and restore behaviour are
implemented and tested. It does not block the synthetic/offline Android beta.

The beta can create a portable local-data export. An export deliberately leaves
the app sandbox and contains sensitive financial information such as
transactions, classifications, amounts, merchant descriptions, rules, budgets,
and subscriptions. Treat it like a bank statement: store it securely, share it
only intentionally, and delete unwanted copies. The versioned export includes
only allow-listed fields and excludes credentials, tokens, and opaque raw
payloads. It is not encrypted by the app.

Restore validates the whole export and applies it atomically: invalid data is
rejected without partially replacing local data. Full wipe removes user and
transaction data from the app database and resets built-in category metadata;
it cannot delete export copies previously saved or shared outside the sandbox.
Uninstalling or clearing app storage also removes local app data, subject to
operating-system behaviour.

The app applies screen-capture protection across its financial screens.
Standard screenshots and screen recording are blocked, and Android recent-app
previews are protected. On iOS, the operating system can still show an
app-switcher snapshot because the current protection does not replace that
snapshot with a privacy view. Capture protection also makes legitimate support,
accessibility, casting, and user-controlled record keeping harder, and it
cannot protect against another camera, a compromised device, accessibility
services with elevated access, or device-management software. Do not use
personal data in support reports.

If network sync, diagnostics, personal bank data, encrypted exports, or the iOS
backup policy are introduced or changed, this notice and the security review
must be updated before release.
