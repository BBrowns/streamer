import { Stack, ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, Pressable } from 'react-native';
import * as Sentry from '@sentry/react-native';
import '../global.css';

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 1.0,
  debug: __DEV__,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: false,
    },
  },
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View className="flex-1 bg-background justify-center items-center p-8">
      <Text className="text-[48px] mb-3">⚠️</Text>
      <Text className="text-error text-xl font-bold mb-2">Something went wrong</Text>
      <Text className="text-textMuted text-sm text-center mb-6 leading-5">
        {error.message || 'An unexpected error occurred.'}
      </Text>
      <Pressable className="bg-primary px-6 py-3.5 rounded-xl shadow-lg shadow-primary/40" onPress={retry}>
        <Text className="text-white font-bold text-base">Try Again</Text>
      </Pressable>
    </View>
  );
}

function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a1a' },
          headerTintColor: '#e0e0ff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0a0a1a' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ title: 'Sign In', presentation: 'modal' }}
        />
        <Stack.Screen
          name="register"
          options={{ title: 'Create Account', presentation: 'modal' }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{ title: 'Forgot Password', presentation: 'modal' }}
        />
        <Stack.Screen
          name="reset-password"
          options={{ title: 'Reset Password', presentation: 'modal' }}
        />
        <Stack.Screen
          name="detail/[type]/[id]"
          options={{ title: '' }}
        />
        <Stack.Screen
          name="addons/index"
          options={{ title: 'Add-ons' }}
        />
        <Stack.Screen
          name="player"
          options={{
            title: 'Now Playing',
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
