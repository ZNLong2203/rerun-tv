const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The TV app shares its learning logic with the server and phone through the
// monorepo's packages/core, which Metro bundles straight from source.
const core = path.resolve(__dirname, '../../packages/core');

const config = {
  watchFolders: [core],
  resolver: {
    extraNodeModules: {
      '@rerun/core': core,
    },
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
