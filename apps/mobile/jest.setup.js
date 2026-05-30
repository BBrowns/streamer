// Setup file

// Mock Expo Secure Store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const testTranslations = {
  "auth.login.title": "Welcome Back",
  "auth.login.subtitle": "Sign in to continue",
  "auth.login.email": "Email",
  "auth.login.password": "Password",
  "auth.login.button": "Sign In",
  "auth.login.forgot": "Forgot password?",
  "auth.login.noAccount": "Don't have an account?",
  "auth.login.signUp": "Sign Up",
  "auth.login.validation.missingFields": "Please fill in all fields",
  "auth.errors.fillFields": "Please fill in all fields",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, fallbackOrOptions) => {
      if (testTranslations[key]) return testTranslations[key];
      if (typeof fallbackOrOptions === "string") return fallbackOrOptions;
      return fallbackOrOptions?.defaultValue || key;
    },
    i18n: {
      language: "en",
      changeLanguage: jest.fn(),
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: jest.fn(),
  },
}));

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

beforeAll(() => {
  // Suppress console errors for unhandled promise rejections if any during tests
  jest.spyOn(console, "error").mockImplementation(() => {});
});

// Mock window for React 19 test renderer
global.window = global.window || {};
global.window.dispatchEvent = jest.fn();
