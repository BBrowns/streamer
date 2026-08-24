import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useAuthStore } from "../stores/authStore";
import { ReactNativeImageColorsExtractor } from "../services/CinematicPaletteExtractor";
import { CinematicThemeRepository } from "../services/CinematicThemeRepository";
import {
  getFallbackCinematicTheme,
  type CinematicTheme,
  type CinematicThemeSource,
} from "../services/cinematicTheme";

type CinematicThemeResolver = Pick<CinematicThemeRepository, "resolve">;
type CinematicThemeSourceOwner = symbol;
type RegisteredCinematicThemeSource = {
  owner: CinematicThemeSourceOwner;
  source: CinematicThemeSource;
};

type CinematicThemeContextValue = {
  theme: CinematicTheme;
  ready: boolean;
  source: CinematicThemeSource | null;
  registerSource: (
    owner: CinematicThemeSourceOwner,
    source: CinematicThemeSource,
  ) => void;
  unregisterSource: (owner: CinematicThemeSourceOwner) => void;
};

const CinematicThemeContext = createContext<CinematicThemeContextValue | null>(
  null,
);

let defaultRepository: CinematicThemeRepository | null = null;

function getDefaultRepository() {
  if (!defaultRepository) {
    defaultRepository = new CinematicThemeRepository({
      extractor: new ReactNativeImageColorsExtractor(),
      storage: AsyncStorage,
      hashUri: (uri) =>
        Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uri),
    });
  }
  return defaultRepository;
}

function publishReadyState(ready: boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.documentElement.dataset.cinematicThemeReady = String(ready);
  if (ready && typeof window !== "undefined") {
    window.dispatchEvent(new Event("cinematic-theme-ready"));
  }
}

export function CinematicThemeProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: CinematicThemeResolver;
}) {
  const { isDark } = useTheme();
  const dynamicArtworkColor = useAuthStore(
    (state) => state.dynamicArtworkColor,
  );
  const fallback = useMemo(() => getFallbackCinematicTheme(isDark), [isDark]);
  const [registeredSources, setRegisteredSources] = useState<
    RegisteredCinematicThemeSource[]
  >([]);
  const source = registeredSources.at(-1)?.source ?? null;
  const [theme, setTheme] = useState(fallback);
  const [ready, setReady] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;

    if (!source || !dynamicArtworkColor) {
      setTheme(fallback);
      setReady(true);
      publishReadyState(true);
      return;
    }

    setReady(false);
    publishReadyState(false);
    void (repository ?? getDefaultRepository())
      .resolve(source, isDark, { enabled: dynamicArtworkColor })
      .then((nextTheme) => {
        if (!active || requestId.current !== currentRequest) return;
        setTheme(nextTheme);
      })
      .catch(() => {
        if (!active || requestId.current !== currentRequest) return;
        setTheme(fallback);
      })
      .finally(() => {
        if (!active || requestId.current !== currentRequest) return;
        setReady(true);
        publishReadyState(true);
      });

    return () => {
      active = false;
    };
  }, [dynamicArtworkColor, fallback, isDark, repository, source]);

  const registerSource = useCallback(
    (owner: CinematicThemeSourceOwner, nextSource: CinematicThemeSource) => {
      setRegisteredSources((current) => {
        const index = current.findIndex((entry) => entry.owner === owner);
        if (index < 0) return [...current, { owner, source: nextSource }];
        const next = [...current];
        next[index] = { owner, source: nextSource };
        return next;
      });
    },
    [],
  );

  const unregisterSource = useCallback((owner: CinematicThemeSourceOwner) => {
    setRegisteredSources((current) =>
      current.filter((entry) => entry.owner !== owner),
    );
  }, []);

  const value = useMemo(
    () => ({ theme, ready, source, registerSource, unregisterSource }),
    [ready, registerSource, source, theme, unregisterSource],
  );

  return (
    <CinematicThemeContext.Provider value={value}>
      {children}
    </CinematicThemeContext.Provider>
  );
}

export function useCinematicTheme() {
  const context = useContext(CinematicThemeContext);
  if (!context) {
    throw new Error(
      "useCinematicTheme must be used inside CinematicThemeProvider",
    );
  }
  return context;
}

export function useCinematicThemeSource(
  source: CinematicThemeSource | null | undefined,
) {
  const { registerSource, unregisterSource } = useCinematicTheme();
  const owner = useRef(Symbol("cinematic-theme-source")).current;
  const contentKey = source?.contentKey;
  const backgroundUri = source?.backgroundUri;
  const posterUri = source?.posterUri;

  useFocusEffect(
    useCallback(() => {
      if (!contentKey) return;
      registerSource(owner, { contentKey, backgroundUri, posterUri });
      return () => unregisterSource(owner);
    }, [
      backgroundUri,
      contentKey,
      owner,
      posterUri,
      registerSource,
      unregisterSource,
    ]),
  );
}
