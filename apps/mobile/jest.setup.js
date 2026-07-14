// Setup file

// Mock Expo Secure Store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () => {
  const animation = {
    duration: () => animation,
    springify: () => animation,
    delay: () => animation,
  };

  return {
    __esModule: true,
    default: {
      View: "Animated.View",
      Image: "Animated.Image",
      FlatList: "Animated.FlatList",
      createAnimatedComponent: (Component) => Component,
      call: () => {},
    },
    FadeIn: animation,
    FadeOut: animation,
    SlideInDown: animation,
    SlideOutDown: animation,
    SlideInUp: animation,
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: (factory) => factory(),
    useAnimatedScrollHandler: () => ({}),
    withTiming: (value) => value,
    withSpring: (value) => value,
    withRepeat: (value) => value,
    interpolate: (_value, _inputRange, outputRange) => outputRange[0],
    runOnJS: (fn) => fn,
  };
});

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  init: jest.fn(),
  setContext: jest.fn(),
  setTags: jest.fn(),
  wrap: (component) => component,
}));

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
  Stack: {
    Screen: () => null,
  },
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
