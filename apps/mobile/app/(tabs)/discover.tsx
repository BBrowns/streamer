import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useCatalog } from '../../hooks/useCatalog';
import type { MetaPreview } from '@streamer/shared';
import { useAuthStore } from '../../stores/authStore';

const TYPES = ['movie', 'series'] as const;

export default function DiscoverScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const router = useRouter();
    const [selectedType, setSelectedType] = useState<string>('movie');
    const { data, isLoading } = useCatalog(selectedType);

    if (!isAuthenticated) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyText}>Sign in to discover content</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.filterRow}>
                {TYPES.map((type) => (
                    <Pressable
                        key={type}
                        style={[styles.filterBtn, selectedType === type && styles.filterActive]}
                        onPress={() => setSelectedType(type)}
                    >
                        <Text
                            style={[
                                styles.filterText,
                                selectedType === type && styles.filterTextActive,
                            ]}
                        >
                            {type === 'movie' ? '🎬 Movies' : '📺 Series'}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#818cf8" />
                </View>
            ) : (
                <FlatList
                    data={data}
                    keyExtractor={(item) => item.id}
                    numColumns={3}
                    contentContainerStyle={styles.grid}
                    renderItem={({ item }) => (
                        <Pressable
                            style={styles.card}
                            onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
                        >
                            <Image source={{ uri: item.poster }} style={styles.poster} />
                            <Text style={styles.cardTitle} numberOfLines={1}>
                                {item.name}
                            </Text>
                        </Pressable>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    filterBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#1a1a3e',
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.15)',
    },
    filterActive: {
        backgroundColor: '#818cf8',
        borderColor: '#818cf8',
    },
    filterText: {
        color: '#9ca3af',
        fontWeight: '600',
        fontSize: 13,
    },
    filterTextActive: {
        color: '#fff',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#9ca3af',
        fontSize: 14,
    },
    grid: {
        paddingHorizontal: 12,
        paddingBottom: 20,
    },
    card: {
        flex: 1,
        margin: 4,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#1a1a3e',
        maxWidth: '31%',
    },
    poster: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: '#2a2a4e',
    },
    cardTitle: {
        color: '#e0e0ff',
        fontSize: 11,
        fontWeight: '600',
        padding: 6,
    },
});
