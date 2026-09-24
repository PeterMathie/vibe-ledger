import { readFile } from 'node:fs/promises';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const app = (await readJson('app.json')).expo;
const eas = await readJson('eas.json');
const pkg = await readJson('package.json');

const failures = [];
const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(
  app.android.package === 'app.vibeledger',
  'Android package changed',
);
requireValue(
  Number.isInteger(app.android.versionCode) && app.android.versionCode > 0,
  'Android versionCode must be a positive integer',
);
requireValue(app.version === pkg.version, 'app and package versions differ');
requireValue(
  app.android.allowBackup === false,
  'Android backup must be disabled',
);
requireValue(app.updates.enabled === false, 'OTA updates must remain disabled');
requireValue(
  eas.cli.appVersionSource === 'local',
  'versioning must remain repository-controlled',
);
requireValue(
  eas.build.production.env.EXPO_PUBLIC_DEMO_MODE === 'false',
  'production must explicitly disable demo data',
);
requireValue(
  eas.build.preview.env.EXPO_PUBLIC_DEMO_MODE === 'true',
  'preview must explicitly opt in to demo data',
);
requireValue(
  eas.build.production.android.buildType === 'app-bundle',
  'production Android output must be an app bundle',
);

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Release config valid: ${app.android.package} ${app.version} (${app.android.versionCode}).`,
);
