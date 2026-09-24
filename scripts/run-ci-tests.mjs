import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const artifactDirectory = '.ci-artifacts';
const reportPath = `${artifactDirectory}/vitest.json`;
const minimumTests = 125;

await mkdir(artifactDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--passWithNoTests=false',
    '--reporter=json',
    `--outputFile=${reportPath}`,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (report.numTotalTests < minimumTests) {
  console.error(
    `Test-count guard failed: found ${report.numTotalTests}; expected at least ${minimumTests}.`,
  );
  process.exit(1);
}

console.log(`Test-count guard passed: ${report.numTotalTests} tests.`);
