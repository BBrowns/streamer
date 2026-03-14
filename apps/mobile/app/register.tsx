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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.formContainer}>
        <Typography variant="h1" align="center" style={styles.title}>
          Create Account
        </Typography>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={styles.subtitle}
        >
          Join the streamer community today
        </Typography>

        {error && (
          <View style={styles.errorContainer}>
            <Typography variant="caption" color={Theme.colors.error}>
              {error instanceof AxiosError
                ? (error.response?.data?.error as string)
                : (error as Error).message || "Registration failed"}
            </Typography>
          </View>
        )}

        <TextField
          label="Display Name"
          placeholder="What should we call you?"
          value={displayName}
          onChangeText={setDisplayName}
          icon="person-outline"
        />
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
          placeholder="Create a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          icon="lock-closed-outline"
        />
        <Button
          title="Register"
          onPress={handleRegister}
          isLoading={isLoading}
          style={styles.registerButton}
        />
        <Pressable onPress={() => router.push("/login")}>
          <Typography
            variant="body"
            align="center"
            color={Theme.colors.textMuted}
          >
            Already have an account?{" "}
            <Typography color={Theme.colors.primary} weight="800">
              Sign In
            </Typography>
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
  registerButton: {
    marginTop: 12,
    marginBottom: 24,
  },
});
