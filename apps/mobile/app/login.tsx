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
import { extractErrorMessage } from "../utils/error";

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

        {!!(error || localError) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {localError || extractErrorMessage(error)}
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
  container: { flex: 1, backgroundColor: "#010101", justifyContent: "center" },
  formContainer: { paddingHorizontal: 32 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#888888",
    marginBottom: 32,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#ef4444", fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: "#080808",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#ffffff",
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  loginButton: {
    backgroundColor: "#00f2ff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: {
    color: "#000000",
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  linkTextCentered: {
    color: "#888888",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
  linkTextPrimary: { color: "#00f2ff", fontWeight: "800" },
  spacer: { height: 12 },
});
