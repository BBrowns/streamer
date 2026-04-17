import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { SearchService } from "../../services/SearchService";
import { hapticImpactLight } from "../../lib/haptics";
import Animated, { FadeIn, FadeOut, SlideInUp } from "react-native-reanimated";

import { useTheme } from "../../hooks/useTheme";

interface SearchOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

export function SearchOverlay({
  isVisible,
  onClose,
  onSearch,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (isVisible) {
      loadRecent();
    }
  }, [isVisible]);

  const loadRecent = async () => {
    const searches = await SearchService.getRecentSearches();
    setRecentSearches(searches);
  };

  const handleSearch = (q: string) => {
    const clean = q.trim();
    if (!clean) return;

    hapticImpactLight();
    SearchService.addRecentSearch(clean);
    onSearch(clean);
    onClose();
  };

  const handleRemoveRecent = async (q: string) => {
    await SearchService.removeRecentSearch(q);
    loadRecent();
  };

  if (!isVisible) return null;

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView
        intensity={80}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.container}>
          <Animated.View
            entering={SlideInUp.duration(300).springify()}
            style={styles.header}
          >
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="search"
                size={20}
                color={colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                autoFocus
                placeholder="Search movies, shows..."
                placeholderTextColor={colors.textSecondary + "90"}
                style={[styles.input, { color: colors.text }]}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleSearch(query)}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              )}
            </View>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.tint }]}>
                Cancel
              </Text>
            </Pressable>
          </Animated.View>

          <View style={styles.content}>
            {recentSearches.length > 0 && query.length === 0 && (
              <Animated.View entering={FadeIn.delay(200)}>
                <View style={styles.recentHeader}>
                  <Text
                    style={[
                      styles.recentTitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Recent Searches
                  </Text>
                  <Pressable
                    onPress={() => {
                      SearchService.clearRecentSearches();
                      setRecentSearches([]);
                    }}
                  >
                    <Text style={styles.clearText}>Clear All</Text>
                  </Pressable>
                </View>
                <View style={styles.recentList}>
                  {recentSearches.map((item, index) => (
                    <Pressable
                      key={index}
                      style={[
                        styles.recentItem,
                        {
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.05)"
                            : "rgba(0,0,0,0.03)",
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => handleSearch(item)}
                    >
                      <Ionicons
                        name="time-outline"
                        size={16}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[styles.recentItemText, { color: colors.text }]}
                      >
                        {item}
                      </Text>
                      <Pressable
                        onPress={() => handleRemoveRecent(item)}
                        style={styles.removeItem}
                      >
                        <Ionicons
                          name="close"
                          size={14}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}

            {query.length > 0 && (
              <View style={styles.hintContainer}>
                <Text
                  style={[styles.hintText, { color: colors.textSecondary }]}
                >
                  Press search to find results for "{query}"
                </Text>
              </View>
            )}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  cancelBtn: {
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  clearText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600",
  },
  recentList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
  },
  recentItemText: {
    fontSize: 14,
    fontWeight: "500",
  },
  removeItem: {
    padding: 2,
  },
  hintContainer: {
    alignItems: "center",
    marginTop: 40,
  },
  hintText: {
    fontSize: 14,
    textAlign: "center",
  },
});
