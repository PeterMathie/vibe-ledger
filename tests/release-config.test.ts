import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('release configuration', () => {
  it('keeps a stable Android identity and disables backups and OTA updates', () => {
    const app = readJson('app.json').expo;

    expect(app.android).toMatchObject({
      package: 'app.vibeledger',
      versionCode: expect.any(Number),
      allowBackup: false,
    });
    expect(app.updates.enabled).toBe(false);
  });

  it('separates explicit demo and production EAS builds', () => {
    const eas = readJson('eas.json');

    expect(eas.build.preview.env.EXPO_PUBLIC_DEMO_MODE).toBe('true');
    expect(eas.build.production.env.EXPO_PUBLIC_DEMO_MODE).toBe('false');
    expect(eas.build.production.android.buildType).toBe('app-bundle');
  });

  it('pins every GitHub Action to an immutable SHA', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const actionReferences = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(
      ([, reference]) => reference,
    );

    expect(actionReferences.length).toBeGreaterThan(0);
    actionReferences.forEach((reference) => {
      expect(reference).toMatch(/^[^@]+@[a-f0-9]{40}$/);
    });
  });

  it('ships an empty fixture source for production resolution', () => {
    const metro = readFileSync('metro.config.js', 'utf8');
    const disabledFixtures = readFileSync(
      'config/disabled-demo-fixtures.ts',
      'utf8',
    );

    expect(metro).toContain("process.env.EXPO_PUBLIC_DEMO_MODE !== 'false'");
    expect(metro).toContain('disabled-demo-fixtures.ts');
    expect(disabledFixtures).not.toContain('AUGUST SYNTHETIC PAY');
    expect(disabledFixtures).toContain('DEMO_TRANSACTIONS = []');
  });

  it('keeps restore reachable while hiding demo loading in production', () => {
    const app = readFileSync('App.tsx', 'utf8');

    expect(app).toContain("process.env.EXPO_PUBLIC_DEMO_MODE !== 'false'");
    expect(app).toContain('Settings and restore');
    expect(app).toContain('demoAvailable ?');
  });

  it('protects financial screens and Android recent-app previews', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const pkg = readJson('package.json');

    expect(pkg.dependencies['expo-screen-capture']).toBeDefined();
    expect(app).toContain('usePreventScreenCapture');
    expect(app).toContain('vibe-ledger-financial-screens');
  });

  it('documents signing, retention, backup, and screen-capture policy', () => {
    const release = readFileSync('docs/RELEASE.md', 'utf8');
    const privacy = readFileSync('PRIVACY.md', 'utf8');
    const security = readFileSync('docs/SECURITY_AND_PRIVACY.md', 'utf8');

    expect(release).toContain('Signing');
    expect(release).toContain('Update retention');
    expect(release).toContain('outside the repository');
    expect(privacy).toMatch(/Android backup\s+is\s+disabled/);
    expect(privacy).toMatch(/screenshots and screen recording are blocked/);
    expect(privacy).toMatch(/Android recent-app\s+previews are protected/);
    expect(privacy).toMatch(/iOS[\s\S]*app-switcher snapshot/);
    expect(privacy).toMatch(
      /blocks release with\s+personal financial data on iOS/,
    );
    expect(security).toMatch(/No equivalent iOS exclusion is\s+configured/);
    expect(security).toContain('expo-screen-capture');
    expect(release).toMatch(/accessibility\/support regression/);
  });

  it('inventories the screen-capture dependency and its data boundary', () => {
    const inventory = readFileSync('docs/THIRD_PARTY.md', 'utf8');

    expect(inventory).toContain('`expo-screen-capture`');
    expect(inventory).toMatch(
      /expo-screen-capture` applies the\s+platform screen-capture protection/,
    );
    expect(inventory).toMatch(/does\s+not send captured content/);
  });

  it('documents the implemented export, atomic restore, and full wipe boundary', () => {
    const release = readFileSync('docs/RELEASE.md', 'utf8');
    const privacy = readFileSync('PRIVACY.md', 'utf8');
    const security = readFileSync('docs/SECURITY_AND_PRIVACY.md', 'utf8');

    for (const document of [release, privacy, security]) {
      expect(document).toMatch(/sensitive financial/i);
      expect(document).toMatch(/opaque\s+raw\s+payload/i);
      expect(document).toMatch(/atomic|transaction/i);
      expect(document).toMatch(/wipe/i);
    }
    expect(privacy).toContain('cannot delete export copies');
    expect(security).toContain('rolls back');
  });
});
