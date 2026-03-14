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
import { useAuthStore } from "../../stores/authStore";

function EditProfileContent() {
  const router = useRouter();
  const { user, setAuth } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [loading, setLoading] = useState(false);

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const { data } = await api.patch("/api/auth/profile", {
        displayName: displayName || undefined,
      });
      if (user) {
        setAuth(
          { ...user, displayName: data.user.displayName },
          useAuthStore.getState().accessToken!,
          useAuthStore.getState().refreshToken!,
        );
      }
      Alert.alert("Success", "Profile updated");
      router.back();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to update profile";
      Alert.alert(
        "Error",
        (errorMessage as string) || "Failed to update profile",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <GlassPanel style={styles.card} intensity="high">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="chevron-back"
                size={18}
                color={Theme.colors.textMuted}
              />
              <Typography
                variant="body"
                color={Theme.colors.textMuted}
                weight="700"
                style={{ marginLeft: 4 }}
              >
                Back to Settings
              </Typography>
            </View>
          </Pressable>
          <Typography variant="h2" style={styles.title}>
            Edit Profile
          </Typography>
        </View>

        <View style={styles.form}>
          <TextField
            label="Display Name"
            placeholder="Name others will see"
            value={displayName}
            onChangeText={setDisplayName}
            icon="person-outline"
          />

          <Button
            title="Save Changes"
            onPress={handleUpdateProfile}
            isLoading={loading}
            size="lg"
            style={styles.button}
          />
        </View>
      </GlassPanel>
    </View>
  );
}

export default function EditProfileScreen() {
  return (
    <ErrorBoundary>
      <EditProfileContent />
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
