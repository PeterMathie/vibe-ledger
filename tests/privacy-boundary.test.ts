import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUNTIME_FILES = ['App.tsx', 'index.ts', ...sourceFiles('src')];

describe('local beta privacy boundary', () => {
  it('has no runtime network, telemetry, or sensitive logging path', () => {
    const runtime = RUNTIME_FILES.map((path) =>
      readFileSync(path, 'utf8'),
    ).join('\n');

    expect(runtime).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
    );
    expect(runtime).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\s*\(/);
    expect(runtime).not.toMatch(
      /(@sentry|firebase\/analytics|appcenter|segment\.io|mixpanel)/i,
    );
  });

  it('keeps networking, analytics, and auth SDKs out of runtime dependencies', () => {
    const packageJson = JSON.parse(
      readFileSync('package.json', 'utf8'),
    ) as Record<string, Record<string, string>>;
    const dependencies = Object.keys(packageJson.dependencies ?? {});

    expect(dependencies).not.toEqual(
      expect.arrayContaining([
        'axios',
        'expo-auth-session',
        'expo-secure-store',
        '@sentry/react-native',
        '@react-native-firebase/analytics',
      ]),
    );
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}
