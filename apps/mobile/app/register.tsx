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

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleRegister = async () => {
    try {
      await register({
        email,
        password,
        displayName: displayName || undefined,
      });
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
          Create Account
        </Text>
        <Text className="text-sm text-textMuted mb-7">
          Join the streaming universe
        </Text>

        {error && (
          <View className="bg-error/10 rounded-lg p-3 mb-4">
            <Text className="text-error text-sm">
              {(error instanceof AxiosError
                ? (error.response?.data?.error as string)
                : null) || "Registration failed"}
            </Text>
          </View>
        )}

        <TextInput
          className="bg-surface rounded-xl px-4 py-3.5 text-textMain text-base mb-3 border border-primary/20"
          placeholder="Display Name (optional)"
          placeholderTextColor="#6b7280"
          value={displayName}
          onChangeText={setDisplayName}
        />
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
          placeholder="Password (min 8 chars)"
          placeholderTextColor="#6b7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          className={`bg-primary rounded-xl py-3.5 items-center mt-2 mb-5 shadow-lg shadow-primary/30 ${isLoading ? "opacity-60" : ""}`}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">
              Create Account
            </Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace("/login")}>
          <Text className="text-textMuted text-center text-sm">
            Already have an account?{" "}
            <Text className="text-primary font-bold">Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
