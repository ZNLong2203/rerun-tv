const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The TV app shares its learning logic and its subtitle component with the
// rest of the monorepo (packages/core, packages/react-native); Metro bundles
// both straight from source.
const core = path.resolve(__dirname, '../../packages/core');
const reactNativePackage = path.resolve(__dirname, '../../packages/react-native');
const tvModules = path.resolve(__dirname, 'node_modules');
const rootModules = path.resolve(__dirname, '../../node_modules');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = {
  watchFolders: [core, reactNativePackage],
  resolver: {
    // The repo root has its own React (for the phone companion). Hide it, so
    // the shared packages fall back to the TV app's React below.
    blockList: [new RegExp(`^${escape(rootModules)}/react(-dom)?/.*`)],
    extraNodeModules: {
      '@rerun/core': core,
      '@rerun/react-native': reactNativePackage,
      react: path.join(tvModules, 'react'),
      'react-native': path.join(tvModules, 'react-native'),
    },
    nodeModulesPaths: [tvModules],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
