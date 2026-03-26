const path = require("path");

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  roots: ["<rootDir>"],
  transformIgnorePatterns: [
    "../../node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@streamer/shared|react-native-reanimated)",
    "node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@streamer/shared|react-native-reanimated)",
  ],
  moduleDirectories: ["node_modules", "../../node_modules"],
  testPathIgnorePatterns: ["<rootDir>/e2e/"],
};
