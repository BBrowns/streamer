const path = require("path");

module.exports = {
  preset: "jest-expo",
  setupFiles: ["react-native-gesture-handler/jestSetup.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  roots: ["<rootDir>"],
  transformIgnorePatterns: [
    "../../node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@streamer/shared|react-native-reanimated|react-native-gesture-handler)",
    "node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@streamer/shared|react-native-reanimated|react-native-gesture-handler)",
  ],
  moduleDirectories: ["node_modules", "../../node_modules"],
  testPathIgnorePatterns: ["<rootDir>/e2e/"],
};
