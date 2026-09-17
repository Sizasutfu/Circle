const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ✅ Silence the "not listed in exports" warning from react-native-webrtc
//    and other legacy packages that use subpath imports internally.
config.resolver.unstable_enablePackageExports = false;

// Optional: tell Metro to treat .mjs as source
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

module.exports = config;