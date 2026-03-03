import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { AxiosError } from "axios";

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleLogin = async () => {
    setLocalError("");
    if (!email || !password) {
      setLocalError("Please fill in all fields");
      return;
    }
    try {
      await login({ email, password });
      router.replace("/(tabs)");
    } catch {}
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background justify-center"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="px-8">
        <Text className="text-3xl font-extrabold text-textMain mb-1">
          Welcome Back
        </Text>
        <Text className="text-sm text-textMuted mb-7">Sign in to continue</Text>

        {(error || localError) && (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm">
              {localError ||
                (error instanceof AxiosError
                  ? (error.response?.data?.error as string)
                  : null) ||
                "Login failed"}
            </Text>
          </View>
        )}

        <TextInput
          className="bg-surface rounded-xl px-4 py-3.5 text-textMain text-base mb-3 border border-primary/20"
          placeholder="Email"
          placeholderTextColor="#6b7280"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          className="bg-surface rounded-xl px-4 py-3.5 text-textMain text-base mb-3 border border-primary/20"
          placeholder="Password"
          placeholderTextColor="#6b7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          className={`bg-primary rounded-xl py-3.5 items-center mt-2 mb-5 shadow-lg shadow-primary/30 ${isLoading ? "opacity-60" : ""}`}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Sign In</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/forgot-password")}>
          <Text className="text-textMuted text-center text-sm">
            <Text className="text-primary font-bold">Forgot password?</Text>
          </Text>
        </Pressable>

        <View className="h-3" />

        <Pressable onPress={() => router.replace("/register")}>
          <Text className="text-textMuted text-center text-sm">
            Don't have an account?{" "}
            <Text className="text-primary font-bold">Sign Up</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
