import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const inventory = await readFile('docs/THIRD_PARTY.md', 'utf8');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const allowed = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
]);
const failures = [];

for (const dependency of Object.keys(pkg.dependencies)) {
  if (!inventory.includes(`\`${dependency}\``)) {
    failures.push(`direct dependency missing from inventory: ${dependency}`);
  }
}

for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location.startsWith('node_modules/')) continue;
  if (!metadata.license) {
    failures.push(`${location}: missing license metadata`);
    continue;
  }
  const expression = String(metadata.license).replace(/[()]/g, '');
  const hasAllowedChoice = expression
    .split(/\s+OR\s+/)
    .some((choice) =>
      choice.split(/\s+AND\s+/).every((license) => allowed.has(license)),
    );
  if (!hasAllowedChoice) {
    failures.push(`${location}: unreviewed license ${metadata.license}`);
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('License gate passed for direct inventory and lockfile metadata.');
