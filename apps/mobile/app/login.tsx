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
import { Button } from "../components/ui/Button";
import { Typography } from "../components/ui/Typography";
import { TextField } from "../components/ui/TextField";
import { Theme } from "../constants/DesignSystem";
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
        <Typography variant="h1" align="center" style={styles.title}>
          Welcome Back
        </Typography>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={styles.subtitle}
        >
          Sign in to access your media library
        </Typography>

        {error && (
          <View style={styles.errorContainer}>
            <Typography variant="caption" color={Theme.colors.error}>
              {error instanceof AxiosError
                ? (error.response?.data?.error as string)
                : (error as Error).message || "Login failed"}
            </Typography>
          </View>
        )}

        <TextField
          label="Email Address"
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          icon="mail-outline"
        />
        <TextField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          icon="lock-closed-outline"
        />
        <Button
          title="Sign In"
          onPress={handleLogin}
          isLoading={isLoading}
          disabled={!email || !password}
          style={styles.loginButton}
        />
        <Pressable onPress={() => router.push("/register")}>
          <Typography
            variant="body"
            align="center"
            color={Theme.colors.textMuted}
          >
            Don't have an account?{" "}
            <Typography color={Theme.colors.primary} weight="800">
              Sign Up
            </Typography>
          </Typography>
        </Pressable>
        <Pressable
          onPress={() => router.push("/forgot-password")}
          style={styles.forgotBtn}
        >
          <Typography
            variant="caption"
            align="center"
            color={Theme.colors.textMuted}
          >
            Forgot Password?
          </Typography>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010101", justifyContent: "center" },
  formContainer: {
    paddingHorizontal: 32,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 32,
  },
  errorContainer: {
    backgroundColor: "rgba(255, 59, 59, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 59, 0.2)",
  },
  loginButton: {
    marginTop: 12,
    marginBottom: 24,
  },
  forgotBtn: {
    marginTop: 16,
  },
});
