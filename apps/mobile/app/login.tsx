import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.formContainer}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {(error || localError) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {localError ||
                (error instanceof AxiosError
                  ? (error.response?.data?.error as string)
                  : null) ||
                "Login failed"}
            </Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/forgot-password")}>
          <Text style={styles.linkTextCentered}>
            <Text style={styles.linkTextPrimary}>Forgot password?</Text>
          </Text>
        </Pressable>

        <View style={styles.spacer} />

        <Pressable onPress={() => router.replace("/register")}>
          <Text style={styles.linkTextCentered}>
            Don't have an account?{" "}
            <Text style={styles.linkTextPrimary}>Sign Up</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050510", justifyContent: "center" },
  formContainer: { paddingHorizontal: 32 },
  title: { fontSize: 30, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#94a3b8", marginBottom: 28 },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#ef4444", fontSize: 14 },
  input: {
    backgroundColor: "#141423",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f8fafc",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.2)",
  },
  loginButton: {
    backgroundColor: "#818cf8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    shadowColor: "#818cf8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
  linkTextCentered: { color: "#94a3b8", textAlign: "center", fontSize: 14 },
  linkTextPrimary: { color: "#818cf8", fontWeight: "bold" },
  spacer: { height: 12 },
});
