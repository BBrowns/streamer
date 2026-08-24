import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import {
  CinematicThemeProvider,
  useCinematicTheme,
  useCinematicThemeSource,
} from "../CinematicThemeContext";
import { getFallbackCinematicTheme } from "../../services/cinematicTheme";
import { useAuthStore } from "../../stores/authStore";

let mockRouteBlur: (() => void) | undefined;

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react") as typeof import("react");
    React.useEffect(() => {
      mockRouteBlur = callback() ?? undefined;
      return () => {
        mockRouteBlur?.();
        mockRouteBlur = undefined;
      };
    }, [callback]);
  },
}));

jest.mock("react-native-image-colors", () => ({
  getColors: jest.fn(),
}));

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: true }),
}));

function ThemeConsumer() {
  useCinematicThemeSource({
    contentKey: "movie:tt0133093",
    backgroundUri: "https://images.example.test/backdrop.jpg",
  });
  const { ready, theme } = useCinematicTheme();
  return <Text testID="theme-state">{`${ready}:${theme.accent}`}</Text>;
}

function SwitchingThemeConsumer({
  contentKey,
}: {
  contentKey: `movie:${string}`;
}) {
  useCinematicThemeSource({
    contentKey,
    backgroundUri: `https://images.example.test/${contentKey}.jpg`,
  });
  const { ready, theme } = useCinematicTheme();
  return <Text testID="switching-theme">{`${ready}:${theme.accent}`}</Text>;
}

function SourcePublisher({ contentKey }: { contentKey: `movie:${string}` }) {
  useCinematicThemeSource({ contentKey });
  return null;
}

function ActiveSource() {
  const { source } = useCinematicTheme();
  return <Text testID="active-source">{source?.contentKey ?? "none"}</Text>;
}

function SourceStack({ showTop }: { showTop: boolean }) {
  return (
    <>
      <SourcePublisher contentKey="movie:underlying" />
      {showTop ? <SourcePublisher contentKey="movie:top" /> : null}
      <ActiveSource />
    </>
  );
}

describe("CinematicThemeProvider", () => {
  beforeEach(() => {
    useAuthStore.setState({ dynamicArtworkColor: true });
    mockRouteBlur = undefined;
  });

  it("releases a mounted source when its route loses focus", async () => {
    const repository = {
      resolve: jest.fn(async () => getFallbackCinematicTheme(true)),
    };
    const screen = await render(
      <CinematicThemeProvider repository={repository}>
        <SourcePublisher contentKey="movie:focused" />
        <ActiveSource />
      </CinematicThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("active-source").props.children).toBe(
        "movie:focused",
      ),
    );
    await act(async () => mockRouteBlur?.());
    await waitFor(() =>
      expect(screen.getByTestId("active-source").props.children).toBe("none"),
    );
  });

  it("renders the fallback immediately and resolves ambience asynchronously", async () => {
    const fallback = getFallbackCinematicTheme(true);
    const resolved = { ...fallback, accent: "#7D563B" };
    let release: ((theme: typeof resolved) => void) | undefined;
    const repository = {
      resolve: jest.fn(
        () =>
          new Promise<typeof resolved>((resolve) => {
            release = resolve;
          }),
      ),
    };

    const screen = await render(
      <CinematicThemeProvider repository={repository}>
        <ThemeConsumer />
      </CinematicThemeProvider>,
    );

    expect(screen.getByTestId("theme-state").props.children).toBe(
      `false:${fallback.accent}`,
    );
    await act(async () => {
      release?.(resolved);
    });
    await waitFor(() =>
      expect(screen.getByTestId("theme-state").props.children).toBe(
        "true:#7D563B",
      ),
    );
    expect(repository.resolve).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending ambience result after the provider unmounts", async () => {
    const fallback = getFallbackCinematicTheme(true);
    let release: ((theme: typeof fallback) => void) | undefined;
    const repository = {
      resolve: jest.fn(
        () =>
          new Promise<typeof fallback>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const screen = await render(
      <CinematicThemeProvider repository={repository}>
        <ThemeConsumer />
      </CinematicThemeProvider>,
    );

    await waitFor(() => expect(repository.resolve).toHaveBeenCalledTimes(1));
    await act(async () => screen.unmount());
    await act(async () => release?.(fallback));

    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes(
          "state update on a component that hasn’t mounted",
        ),
      ),
    ).toBe(false);
    errorSpy.mockRestore();
  });

  it("does not invoke extraction while dynamic artwork colour is disabled", async () => {
    useAuthStore.setState({ dynamicArtworkColor: false });
    const repository = { resolve: jest.fn() };

    const screen = await render(
      <CinematicThemeProvider repository={repository}>
        <ThemeConsumer />
      </CinematicThemeProvider>,
    );

    expect(screen.getByTestId("theme-state").props.children).toBe(
      `true:${getFallbackCinematicTheme(true).accent}`,
    );
    expect(repository.resolve).not.toHaveBeenCalled();
  });

  it("restores the underlying mounted source when the top publisher unmounts", async () => {
    const repository = {
      resolve: jest.fn(async () => getFallbackCinematicTheme(true)),
    };
    const tree = (showTop: boolean) => (
      <CinematicThemeProvider repository={repository}>
        <SourceStack showTop={showTop} />
      </CinematicThemeProvider>
    );
    const screen = await render(tree(true));

    await waitFor(() =>
      expect(screen.getByTestId("active-source").props.children).toBe(
        "movie:top",
      ),
    );

    screen.rerender(tree(false));

    await waitFor(() =>
      expect(screen.getByTestId("active-source").props.children).toBe(
        "movie:underlying",
      ),
    );
  });

  it("keeps the previous media palette visible while the next title resolves", async () => {
    const fallback = getFallbackCinematicTheme(true);
    const firstTheme = { ...fallback, accent: "#9A4E2E" };
    const secondTheme = { ...fallback, accent: "#365B78" };
    const pending = new Map<string, (theme: typeof firstTheme) => void>();
    const repository = {
      resolve: jest.fn(
        (source: { contentKey: string }) =>
          new Promise<typeof firstTheme>((resolve) => {
            pending.set(source.contentKey, resolve);
          }),
      ),
    };
    const tree = (contentKey: `movie:${string}`) => (
      <CinematicThemeProvider repository={repository}>
        <SwitchingThemeConsumer contentKey={contentKey} />
      </CinematicThemeProvider>
    );
    const screen = await render(tree("movie:warm"));

    await act(async () => pending.get("movie:warm")?.(firstTheme));
    await waitFor(() =>
      expect(screen.getByTestId("switching-theme").props.children).toBe(
        "true:#9A4E2E",
      ),
    );

    screen.rerender(tree("movie:cool"));

    await waitFor(() =>
      expect(screen.getByTestId("switching-theme").props.children).toBe(
        "false:#9A4E2E",
      ),
    );
    await act(async () => pending.get("movie:cool")?.(secondTheme));
    await waitFor(() =>
      expect(screen.getByTestId("switching-theme").props.children).toBe(
        "true:#365B78",
      ),
    );
  });
});
