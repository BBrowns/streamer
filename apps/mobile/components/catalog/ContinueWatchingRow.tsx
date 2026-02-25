import React, { memo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useContinueWatching } from '../../hooks/useContinueWatching';
import { usePlayerStore } from '../../stores/playerStore';
import type { WatchProgress } from '@streamer/shared';

/** Progress bar showing how far through the content */
function ProgressBar({ current, total }: { current: number; total: number }) {
    const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
    return (
        <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
    );
}

function ContinueWatchingCard({ item }: { item: WatchProgress }) {
    const router = useRouter();

    const handlePress = () => {
        // Navigate to the detail page for this item
        router.push(`/detail/${item.type}/${item.itemId}`);
    };

    const remainingMinutes = Math.ceil((item.duration - item.currentTime) / 60);

    return (
        <Pressable
            style={styles.card}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`Continue watching ${item.title}, ${remainingMinutes} minutes remaining`}
            accessibilityHint="Opens the detail page to resume playback"
        >
            <Image
                source={{ uri: item.poster ?? undefined }}
                style={styles.poster}
                accessibilityLabel={`${item.title} poster`}
            />
            <ProgressBar current={item.currentTime} total={item.duration} />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                </Text>
                <Text style={styles.cardSub}>
                    {remainingMinutes}m left
                    {item.season != null && item.episode != null
                        ? ` · S${item.season}E${item.episode}`
                        : ''}
                </Text>
            </View>
        </Pressable>
    );
}

const MemoizedCard = memo(ContinueWatchingCard);

/** Continue Watching horizontal row for the Discover/Home screen */
export function ContinueWatchingRow() {
    const { data: items, isLoading } = useContinueWatching();

    if (isLoading || !items || items.length === 0) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>▶️ Continue Watching</Text>
            <FlatList
                horizontal
                data={items}
                keyExtractor={(item) => `cw-${item.itemId}-${item.season}-${item.episode}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => <MemoizedCard item={item} />}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    sectionTitle: {
        color: '#e0e0ff',
        fontSize: 17,
        fontWeight: '700',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    listContent: {
        paddingHorizontal: 12,
        gap: 10,
    },
    card: {
        width: 160,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#1a1a3e',
    },
    poster: {
        width: 160,
        height: 90,
        backgroundColor: '#2a2a4e',
    },
    progressTrack: {
        height: 3,
        backgroundColor: 'rgba(129, 140, 248, 0.2)',
    },
    progressFill: {
        height: 3,
        backgroundColor: '#818cf8',
        borderRadius: 2,
    },
    cardInfo: {
        padding: 8,
    },
    cardTitle: {
        color: '#e0e0ff',
        fontSize: 12,
        fontWeight: '600',
    },
    cardSub: {
        color: '#6b7280',
        fontSize: 10,
        marginTop: 2,
    },
});
