import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { api } from "../../services/api";
import { Theme } from "../../constants/DesignSystem";
import { Typography } from "../../components/ui/Typography";
import { TextField } from "../../components/ui/TextField";
import { Button } from "../../components/ui/Button";
import { GlassPanel } from "../../components/ui/GlassPanel";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";

function ChangePasswordContent() {
  const router = useRouter();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      Alert.alert("Success", "Password changed successfully");
      router.back();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to change password";
      Alert.alert(
        "Error",
        (errorMessage as string) || "Failed to change password",
      );
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <GlassPanel style={styles.card} intensity="high">
        <View style={styles.header}>
          <PressableLink
            onPress={() => router.back()}
            icon="chevron-back"
            label="Back to Settings"
          />
          <Typography variant="h2" style={styles.title}>
            Change Password
          </Typography>
        </View>

        <View style={styles.form}>
          <TextField
            label="Current Password"
            placeholder="Enter current password"
            value={currentPw}
            onChangeText={setCurrentPw}
            secureTextEntry
            icon="shield-outline"
          />
          <TextField
            label="New Password"
            placeholder="Min 8 characters"
            value={newPw}
            onChangeText={setNewPw}
            secureTextEntry
            icon="lock-closed-outline"
          />

          <Button
            title="Update Password"
            onPress={handleChangePassword}
            isLoading={pwLoading}
            size="lg"
            style={styles.button}
          />
        </View>
      </GlassPanel>
    </View>
  );
}

function PressableLink({ onPress, icon, label }: any) {
  return (
    <Pressable onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name={icon} size={18} color={Theme.colors.textMuted} />
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          weight="700"
          style={{ marginLeft: 4 }}
        >
          {label}
        </Typography>
      </View>
    </Pressable>
  );
}

export default function ChangePasswordScreen() {
  return (
    <ErrorBoundary>
      <ChangePasswordContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    padding: 32,
    borderRadius: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    marginTop: 16,
  },
  form: {
    gap: 16,
  },
  button: {
    marginTop: 12,
  },
});
