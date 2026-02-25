import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { useLibrary, useRemoveFromLibrary } from '../../hooks/useLibrary';
import { useContinueWatching } from '../../hooks/useContinueWatching';
import { ContinueWatchingRow } from '../../components/catalog/ContinueWatchingRow';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import type { LibraryItem } from '@streamer/shared';

function LibraryCard({ item, onRemove }: { item: LibraryItem; onRemove: (id: string) => void }) {
    const router = useRouter();

    return (
        <Pressable
            style={styles.libraryCard}
            onPress={() => router.push(`/detail/${item.type}/${item.itemId}`)}
            onLongPress={() => onRemove(item.itemId)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. Long press to remove from library`}
            accessibilityHint="Opens detail page"
        >
            <Image
                source={{ uri: item.poster ?? undefined }}
                style={styles.cardPoster}
                accessibilityLabel={`${item.title} poster`}
            />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.cardMeta}>
                    {item.type === 'movie' ? '🎬 Movie' : '📺 Series'}
                </Text>
            </View>
        </Pressable>
    );
}

export default function LibraryScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: items, isLoading } = useLibrary();
    const removeFromLibrary = useRemoveFromLibrary();
    const [refreshing, setRefreshing] = useState(false);

    const handleRemove = useCallback((itemId: string) => {
        removeFromLibrary.mutate(itemId);
    }, [removeFromLibrary]);

    if (!isAuthenticated) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyIcon}>📚</Text>
                <Text style={styles.emptyTitle}>Your Library</Text>
                <Text style={styles.emptyText}>Sign in to access your watchlist</Text>
                <Pressable
                    style={styles.ctaBtn}
                    onPress={() => router.push('/login')}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                >
                    <Text style={styles.ctaBtnText}>Sign In</Text>
                </Pressable>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#818cf8" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={items ?? []}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.gridContent}
                ListHeaderComponent={<ContinueWatchingRow />}
                ListEmptyComponent={
                    <View style={styles.emptyList}>
                        <Text style={styles.emptyIcon}>📭</Text>
                        <Text style={styles.emptyTitle}>No Items Yet</Text>
                        <Text style={styles.emptyText}>
                            Browse the Discover tab and add movies & shows to your library.
                        </Text>
                    </View>
                }
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await queryClient.invalidateQueries({ queryKey: ['library'] });
                            await queryClient.invalidateQueries({ queryKey: ['progress'] });
                            setRefreshing(false);
                        }}
                        tintColor="#818cf8"
                        colors={['#818cf8']}
                    />
                }
                renderItem={({ item }) => (
                    <LibraryCard item={item} onRemove={handleRemove} />
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    centered: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        color: '#e0e0ff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptyText: {
        color: '#9ca3af',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    emptyList: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 32,
    },
    ctaBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        minWidth: 44,
        minHeight: 44,
    },
    ctaBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
    gridContent: {
        paddingBottom: 24,
    },
    gridRow: {
        paddingHorizontal: 12,
        gap: 10,
        marginBottom: 10,
    },
    libraryCard: {
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#1a1a3e',
        minHeight: 44,
    },
    cardPoster: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: '#2a2a4e',
    },
    cardInfo: {
        padding: 8,
    },
    cardTitle: {
        color: '#e0e0ff',
        fontSize: 13,
        fontWeight: '600',
    },
    cardMeta: {
        color: '#6b7280',
        fontSize: 11,
        marginTop: 3,
    },
});
