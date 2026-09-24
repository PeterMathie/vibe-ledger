const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const demoMode = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';

if (!demoMode) {
  const defaultResolveRequest = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      moduleName === '../demo/fixtures' &&
      context.originModulePath.endsWith(
        path.join('src', 'data', 'demo-repository.ts'),
      )
    ) {
      return {
        filePath: path.resolve(
          __dirname,
          'config',
          'disabled-demo-fixtures.ts',
        ),
        type: 'sourceFile',
      };
    }

    return defaultResolveRequest
      ? defaultResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
