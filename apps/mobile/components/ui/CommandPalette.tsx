import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Modal,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";
import type { MetaPreview } from "@streamer/shared";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CommandPalette({ visible, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const { data: results, isFetching } = useGlobalSearch(query);
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 140,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.95);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleSelect = useCallback(
    (item: MetaPreview) => {
      onClose();
      router.push(`/detail/${item.type}/${item.id}`);
    },
    [onClose, router],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[
            styles.palette,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}
        >
          {/* Search Input */}
          <Pressable
            style={styles.inputRow}
            onPress={() => inputRef.current?.focus()}
          >
            <Ionicons name="search" size={20} color="#6b7280" />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search movies, shows..."
              placeholderTextColor="#4b5563"
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {isFetching && <ActivityIndicator size="small" color="#00f2ff" />}
            {query.length > 0 && !isFetching && (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#6b7280" />
              </Pressable>
            )}
          </Pressable>

          <View style={styles.divider} />

          {/* Results */}
          {query.length < 2 ? (
            <View style={styles.hint}>
              <Ionicons name="search-outline" size={32} color="#374151" />
              <Text style={styles.hintText}>
                Type at least 2 characters to search
              </Text>
            </View>
          ) : results && results.length === 0 && !isFetching ? (
            <View style={styles.hint}>
              <Ionicons name="film-outline" size={32} color="#374151" />
              <Text style={styles.hintText}>No results for "{query}"</Text>
            </View>
          ) : (
            <FlatList
              data={results ?? []}
              keyExtractor={(item) => item.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.resultRow,
                    pressed && styles.resultRowPressed,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <Image
                    source={{ uri: item.poster }}
                    style={styles.poster}
                    resizeMode="cover"
                  />
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.resultMeta}>
                      <Ionicons
                        name={
                          item.type === "movie" ? "film-outline" : "tv-outline"
                        }
                        size={12}
                        color="#6b7280"
                      />
                      <Text style={styles.resultType}>
                        {item.type === "movie" ? "Movie" : "Series"}
                      </Text>
                      {!!item.imdbRating && (
                        <Text style={styles.resultRating}>
                          ⭐ {item.imdbRating}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#374151" />
                </Pressable>
              )}
            />
          )}

          {/* Footer hint */}
          <View style={styles.footer}>
            <View style={styles.footerBadge}>
              <Text style={styles.footerKey}>↵</Text>
            </View>
            <Text style={styles.footerLabel}>Open</Text>
            <View style={styles.footerBadge}>
              <Text style={styles.footerKey}>Esc</Text>
            </View>
            <Text style={styles.footerLabel}>Close</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
  },
  palette: {
    width: "90%",
    maxWidth: 600,
    backgroundColor: "#0f0f1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
    elevation: 24,
    maxHeight: 520,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  input: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "500",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  list: { maxHeight: 360 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultRowPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  poster: {
    width: 40,
    height: 60,
    borderRadius: 6,
    backgroundColor: "#1a1a2e",
  },
  resultInfo: { flex: 1 },
  resultTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  resultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  resultType: { color: "#6b7280", fontSize: 12 },
  resultRating: { color: "#fbbf24", fontSize: 12, fontWeight: "700" },
  hint: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  hintText: { color: "#4b5563", fontSize: 14 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  footerBadge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  footerKey: { color: "#9ca3af", fontSize: 11, fontWeight: "700" },
  footerLabel: { color: "#4b5563", fontSize: 12, marginRight: 8 },
});
