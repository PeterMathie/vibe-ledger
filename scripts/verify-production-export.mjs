import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';

const root = process.argv[2];
if (!root) {
  throw new Error('Usage: node scripts/verify-production-export.mjs <export>');
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? files(target) : [target];
    }),
  );
  return nested.flat();
}

const exportFiles = await files(root);
const bundles = exportFiles.filter((file) => /\.(?:js|hbc)$/.test(file));
if (bundles.length === 0) {
  throw new Error(`No Android JavaScript bundle found under ${root}`);
}

const forbiddenMarkers = [
  'AUGUST SYNTHETIC PAY',
  'demo-subscription:studio-annual',
  'Included synthetic spend that demonstrates proportional runover.',
  'SYNTHETIC SALARY',
  'SYNTHETIC COFFEE',
  'Synthetic house saving',
];

for (const bundle of bundles) {
  const contents = await readFile(bundle);
  for (const marker of forbiddenMarkers) {
    if (contents.includes(Buffer.from(marker))) {
      throw new Error(`Production export contains demo marker: ${marker}`);
    }
  }
}

console.log(
  `Production export gate passed: ${bundles.length} bundle(s), no demo fixture payload.`,
);
