import {
    View,
    Text,
    StyleSheet,
    Image,
    ScrollView,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useMeta } from '../../../hooks/useMeta';
import { useStreams } from '../../../hooks/useStreams';
import { usePlayerStore } from '../../../stores/playerStore';
import { streamEngineManager } from '../../../services/streamEngine/StreamEngineManager';
import type { Stream } from '@streamer/shared';

export default function DetailScreen() {
    const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
    const router = useRouter();
    const { data: meta, isLoading: metaLoading } = useMeta(type, id);
    const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
    const setStream = usePlayerStore((s) => s.setStream);

    const handlePlayStream = (stream: Stream) => {
        const uri = streamEngineManager.getPlaybackUri(stream);
        if (uri) {
            setStream(stream);
            router.push('/player');
        }
    };

    if (metaLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#818cf8" />
            </View>
        );
    }

    if (!meta) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>Content not found</Text>
            </View>
        );
    }

    return (
        <>
            <Stack.Screen options={{ title: meta.name }} />
            <ScrollView style={styles.container}>
                {/* Hero Image */}
                {meta.background && (
                    <Image source={{ uri: meta.background }} style={styles.backdrop} />
                )}
                {!meta.background && meta.poster && (
                    <Image source={{ uri: meta.poster }} style={styles.backdrop} />
                )}

                <View style={styles.content}>
                    <Text style={styles.title}>{meta.name}</Text>

                    <View style={styles.metaRow}>
                        {!!meta.releaseInfo && (
                            <Text style={styles.metaTag}>{meta.releaseInfo}</Text>
                        )}
                        {!!meta.runtime && (
                            <Text style={styles.metaTag}>{meta.runtime}</Text>
                        )}
                        {!!meta.imdbRating && (
                            <Text style={styles.ratingTag}>⭐ {meta.imdbRating}</Text>
                        )}
                    </View>

                    {!!meta.genres && meta.genres.length > 0 && (
                        <View style={styles.genreRow}>
                            {meta.genres.map((g, idx) => (
                                <View key={`${g}-${idx}`} style={styles.genrePill}>
                                    <Text style={styles.genreText}>{g}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {!!meta.description && (
                        <Text style={styles.description}>{meta.description}</Text>
                    )}

                    {!!meta.cast && meta.cast.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Cast</Text>
                            <Text style={styles.sectionContent}>{meta.cast.join(', ')}</Text>
                        </View>
                    )}

                    {/* Streams */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>🎬 Available Streams</Text>

                        {streamsLoading ? (
                            <ActivityIndicator color="#818cf8" />
                        ) : (!!streams && streams.length > 0) ? (
                            streams.map((stream, i) => {
                                const engine = streamEngineManager.resolveEngine(stream);
                                return (
                                    <Pressable
                                        key={i}
                                        style={styles.streamCard}
                                        onPress={() => handlePlayStream(stream)}
                                    >
                                        <View>
                                            <Text style={styles.streamTitle}>
                                                {stream.title || stream.name || `Stream ${i + 1}`}
                                            </Text>
                                            <Text style={styles.streamEngine}>
                                                Engine: {engine?.getEngineType() || 'unknown'}
                                            </Text>
                                        </View>
                                        <Text style={styles.playIcon}>▶</Text>
                                    </Pressable>
                                );
                            })
                        ) : (
                            <Text style={styles.emptyText}>
                                No streams available. Install more add-ons.
                            </Text>
                        )}
                    </View>
                </View>
            </ScrollView>
        </>
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
    },
    errorText: {
        color: '#f87171',
    },
    backdrop: {
        width: '100%',
        height: 240,
        backgroundColor: '#1a1a3e',
    },
    content: {
        padding: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#e0e0ff',
        marginBottom: 8,
    },
    metaRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
    },
    metaTag: {
        color: '#9ca3af',
        fontSize: 13,
        backgroundColor: '#1a1a3e',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    ratingTag: {
        color: '#fbbf24',
        fontSize: 13,
        backgroundColor: '#1a1a3e',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    genreRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 16,
    },
    genrePill: {
        backgroundColor: 'rgba(129, 140, 248, 0.15)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    genreText: {
        color: '#818cf8',
        fontSize: 11,
        fontWeight: '600',
    },
    description: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 20,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        color: '#e0e0ff',
        fontWeight: '700',
        fontSize: 16,
        marginBottom: 8,
    },
    sectionContent: {
        color: '#9ca3af',
        fontSize: 13,
        lineHeight: 20,
    },
    streamCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1a1a3e',
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.1)',
    },
    streamTitle: {
        color: '#e0e0ff',
        fontWeight: '600',
        fontSize: 14,
    },
    streamEngine: {
        color: '#6b7280',
        fontSize: 11,
        marginTop: 2,
    },
    playIcon: {
        color: '#818cf8',
        fontSize: 20,
    },
    emptyText: {
        color: '#6b7280',
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 20,
    },
});
