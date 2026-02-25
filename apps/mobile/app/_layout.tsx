import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
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
