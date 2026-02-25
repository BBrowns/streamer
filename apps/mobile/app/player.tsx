import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../stores/playerStore';
import { streamEngineManager } from '../services/streamEngine/StreamEngineManager';
import { useUpdateProgress } from '../hooks/useContinueWatching';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { AudioTrack, SubtitleTrack, StreamStats } from '../services/streamEngine/IStreamEngine';
import { Ionicons } from '@expo/vector-icons';

// Conditionally import Video for native only
let Video: any = null;
try {
    Video = require('react-native-video').default;
} catch {
    // Web fallback — will use HTML5 video element
}

// --- Double-Tap Seek Gesture ---
const SEEK_SECONDS = 10;
const DOUBLE_TAP_DELAY = 300;

// --- Progress Reporting Interval ---
const PROGRESS_REPORT_INTERVAL = 15_000; // Report every 15 seconds

export default function PlayerScreen() {
    const router = useRouter();
    const { currentStream, mediaInfo, isBuffering, setBuffering, setProgress, clearPlayer } =
        usePlayerStore();
    const videoRef = useRef<any>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
    const [stats, setStats] = useState<StreamStats>({ speed: 0, peers: 0 });

    // Double-tap seek state
    const [seekFeedback, setSeekFeedback] = useState<'left' | 'right' | null>(null);
    const lastTapRef = useRef<{ time: number; side: 'left' | 'right' } | null>(null);
    const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Progress reporting
    const updateProgress = useUpdateProgress();
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentTimeRef = useRef(0);
    const durationRef = useRef(0);

    const engine = currentStream ? streamEngineManager.resolveEngine(currentStream) : null;
    const playbackUri = currentStream
        ? streamEngineManager.getPlaybackUri(currentStream)
        : null;

    // Subscribe to engine events
    useEffect(() => {
        if (!engine) return;

        setAudioTracks(engine.getAudioTracks());
        setSubtitles(engine.getSubtitles());

        const onStats = (data: StreamStats) => setStats(data);
        engine.on('stats', onStats);

        return () => {
            engine.off('stats', onStats);
        };
    }, [engine]);

    // Progress reporting to server (every 15s)
    useEffect(() => {
        if (!mediaInfo) return;

        progressTimerRef.current = setInterval(() => {
            if (currentTimeRef.current > 0 && durationRef.current > 0) {
                updateProgress.mutate({
                    type: mediaInfo.type,
                    itemId: mediaInfo.itemId,
                    title: mediaInfo.title,
                    poster: mediaInfo.poster,
                    season: mediaInfo.season,
                    episode: mediaInfo.episode,
                    currentTime: currentTimeRef.current,
                    duration: durationRef.current,
                });
            }
        }, PROGRESS_REPORT_INTERVAL);

        return () => {
            // Report final progress on unmount
            if (currentTimeRef.current > 0 && durationRef.current > 0) {
                updateProgress.mutate({
                    type: mediaInfo.type,
                    itemId: mediaInfo.itemId,
                    title: mediaInfo.title,
                    poster: mediaInfo.poster,
                    season: mediaInfo.season,
                    episode: mediaInfo.episode,
                    currentTime: currentTimeRef.current,
                    duration: durationRef.current,
                });
            }
            if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        };
    }, [mediaInfo]);

    const handleProgress = useCallback(
        ({ currentTime, seekableDuration }: { currentTime: number; seekableDuration: number }) => {
            currentTimeRef.current = currentTime;
            durationRef.current = seekableDuration;
            setProgress(currentTime, seekableDuration);
        },
        [setProgress],
    );

    const handleDoubleTap = useCallback(
        (side: 'left' | 'right') => {
            const now = Date.now();
            const lastTap = lastTapRef.current;

            if (lastTap && now - lastTap.time < DOUBLE_TAP_DELAY && lastTap.side === side) {
                // Double-tap detected — seek
                const seekTo =
                    side === 'right'
                        ? Math.min(currentTimeRef.current + SEEK_SECONDS, durationRef.current)
                        : Math.max(currentTimeRef.current - SEEK_SECONDS, 0);

                videoRef.current?.seek?.(seekTo);

                setSeekFeedback(side);
                if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
                seekFeedbackTimer.current = setTimeout(() => setSeekFeedback(null), 600);

                lastTapRef.current = null;
            } else {
                lastTapRef.current = { time: now, side };
            }
        },
        [],
    );

    const handleSelectAudio = useCallback((id: string) => {
        engine?.setAudioTrack(id);
        setAudioTracks(engine?.getAudioTracks() ?? []);
    }, [engine]);

    const handleSelectSubtitle = useCallback((id: string | null) => {
        engine?.setSubtitle(id);
        setSubtitles(engine?.getSubtitles() ?? []);
    }, [engine]);

    if (!currentStream || !playbackUri) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <Text style={styles.errorText}>No stream selected</Text>
                    <Pressable
                        style={styles.backBtn}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    const headerBar = (
        <View style={styles.header}>
            <Pressable
                style={styles.closeBtn}
                onPress={() => { clearPlayer(); router.back(); }}
                accessibilityRole="button"
                accessibilityLabel="Close player"
            >
                <Text style={styles.closeBtnText}>✕ Close</Text>
            </Pressable>
            <Pressable
                style={styles.settingsBtn}
                onPress={() => setSettingsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Playback settings"
            >
                <Ionicons name="settings-sharp" size={20} color="#e0e0ff" />
            </Pressable>
        </View>
    );

    const infoBar = (
        <View style={styles.infoBar}>
            <Text style={styles.nowPlaying}>
                🎬 {currentStream.title || currentStream.name || 'Now Playing'}
            </Text>
            <View style={styles.engineRow}>
                <Text style={styles.engineLabel}>
                    Engine: {engine?.getEngineType().toUpperCase() ?? 'Unknown'}
                </Text>
                {stats.peers > 0 && (
                    <Text style={styles.statsLabel}>
                        ↓ {(stats.speed / 1024).toFixed(0)} KB/s · {stats.peers} peers
                    </Text>
                )}
            </View>
        </View>
    );

    // Double-tap seek overlay (shows ±10s feedback)
    const seekOverlay = seekFeedback && (
        <View style={[styles.seekOverlay, seekFeedback === 'left' ? styles.seekLeft : styles.seekRight]}>
            <Text style={styles.seekText}>
                {seekFeedback === 'left' ? `⏪ ${SEEK_SECONDS}s` : `${SEEK_SECONDS}s ⏩`}
            </Text>
        </View>
    );

    // Gesture zones for double-tap seek (left = rewind, right = forward)
    const gestureZones = Platform.OS !== 'web' && (
        <View style={styles.gestureContainer} pointerEvents="box-none">
            <Pressable
                style={styles.gestureZoneLeft}
                onPress={() => handleDoubleTap('left')}
                accessibilityLabel="Double-tap to seek backward 10 seconds"
            />
            <Pressable
                style={styles.gestureZoneRight}
                onPress={() => handleDoubleTap('right')}
                accessibilityLabel="Double-tap to seek forward 10 seconds"
            />
        </View>
    );

    const settingsModal = (
        <Modal
            visible={settingsOpen}
            animationType="slide"
            transparent
            onRequestClose={() => setSettingsOpen(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>⚙️ Playback Settings</Text>
                        <Pressable
                            onPress={() => setSettingsOpen(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Close settings"
                        >
                            <Text style={styles.modalClose}>Done</Text>
                        </Pressable>
                    </View>

                    {/* Audio Tracks */}
                    <Text style={styles.modalSection}>🔊 Audio Tracks</Text>
                    {audioTracks.length === 0 ? (
                        <Text style={styles.emptyHint}>
                            No selectable audio tracks — using default.
                        </Text>
                    ) : (
                        <FlatList
                            data={audioTracks}
                            keyExtractor={(t) => t.id}
                            scrollEnabled={false}
                            renderItem={({ item }) => (
                                <Pressable
                                    style={[styles.trackItem, item.active && styles.trackActive]}
                                    onPress={() => handleSelectAudio(item.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Audio: ${item.label}${item.active ? ', selected' : ''}`}
                                >
                                    <Text style={styles.trackLabel}>{item.label}</Text>
                                    <Text style={styles.trackLang}>{item.language}</Text>
                                    {item.active && <Text style={styles.trackCheck}>✓</Text>}
                                </Pressable>
                            )}
                        />
                    )}

                    {/* Subtitles */}
                    <Text style={[styles.modalSection, { marginTop: 20 }]}>💬 Subtitles</Text>
                    {subtitles.length === 0 ? (
                        <Text style={styles.emptyHint}>
                            No subtitle tracks available.
                        </Text>
                    ) : (
                        <>
                            <Pressable
                                style={[styles.trackItem, subtitles.every((s) => !s.active) && styles.trackActive]}
                                onPress={() => handleSelectSubtitle(null)}
                                accessibilityRole="button"
                                accessibilityLabel="Subtitles off"
                            >
                                <Text style={styles.trackLabel}>Off</Text>
                            </Pressable>
                            <FlatList
                                data={subtitles}
                                keyExtractor={(t) => t.id}
                                scrollEnabled={false}
                                renderItem={({ item }) => (
                                    <Pressable
                                        style={[styles.trackItem, item.active && styles.trackActive]}
                                        onPress={() => handleSelectSubtitle(item.id)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Subtitle: ${item.label}${item.active ? ', selected' : ''}`}
                                    >
                                        <Text style={styles.trackLabel}>{item.label}</Text>
                                        <Text style={styles.trackLang}>{item.language}</Text>
                                        {item.active && <Text style={styles.trackCheck}>✓</Text>}
                                    </Pressable>
                                )}
                            />
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );

    // Web fallback using HTML5 video
    if (Platform.OS === 'web') {
        return (
            <View style={styles.container}>
                {headerBar}
                <View style={styles.playerContainer}>
                    {/* @ts-ignore — RNW doesn't know about video tag */}
                    <video
                        src={playbackUri}
                        controls
                        autoPlay
                        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                    />
                </View>
                {infoBar}
                {settingsModal}
            </View>
        );
    }

    // Native player using react-native-video
    return (
        <View style={styles.container}>
            {headerBar}

            <View style={styles.playerContainer}>
                {isBuffering && (
                    <View style={styles.bufferOverlay}>
                        <ActivityIndicator size="large" color="#818cf8" />
                    </View>
                )}
                {seekOverlay}
                {gestureZones}
                {Video && (
                    <Video
                        ref={videoRef}
                        source={{ uri: playbackUri }}
                        style={styles.video}
                        resizeMode="contain"
                        controls
                        onBuffer={({ isBuffering: b }: { isBuffering: boolean }) => setBuffering(b)}
                        onProgress={handleProgress}
                        onError={(err: any) => {
                            console.error('Video playback error:', err);
                        }}
                    />
                )}
            </View>

            {infoBar}
            {settingsModal}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        color: '#f87171',
        fontSize: 16,
        marginBottom: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
    closeBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeBtnText: {
        color: '#e0e0ff',
        fontWeight: '600',
        fontSize: 14,
    },
    settingsBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    bufferOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    // Gesture zones for double-tap seek
    gestureContainer: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        zIndex: 5,
    },
    gestureZoneLeft: {
        flex: 1,
    },
    gestureZoneRight: {
        flex: 1,
    },
    // Seek feedback overlay
    seekOverlay: {
        position: 'absolute',
        top: '40%',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 24,
        zIndex: 20,
    },
    seekLeft: {
        left: 40,
    },
    seekRight: {
        right: 40,
    },
    seekText: {
        color: '#e0e0ff',
        fontSize: 16,
        fontWeight: '700',
    },
    infoBar: {
        backgroundColor: 'rgba(10, 10, 26, 0.95)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 40,
    },
    nowPlaying: {
        color: '#e0e0ff',
        fontWeight: '700',
        fontSize: 15,
    },
    engineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 2,
    },
    engineLabel: {
        color: '#6b7280',
        fontSize: 11,
    },
    statsLabel: {
        color: '#818cf8',
        fontSize: 11,
        fontWeight: '600',
    },
    backBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backBtnText: {
        color: '#fff',
        fontWeight: '600',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#0d0d24',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
        maxHeight: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#e0e0ff',
        fontSize: 18,
        fontWeight: '700',
    },
    modalClose: {
        color: '#818cf8',
        fontWeight: '700',
        fontSize: 15,
    },
    modalSection: {
        color: '#e0e0ff',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptyHint: {
        color: '#6b7280',
        fontSize: 12,
        fontStyle: 'italic',
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 4,
        minHeight: 44,
    },
    trackActive: {
        backgroundColor: 'rgba(129, 140, 248, 0.15)',
    },
    trackLabel: {
        color: '#e0e0ff',
        fontSize: 14,
        flex: 1,
    },
    trackLang: {
        color: '#6b7280',
        fontSize: 12,
        marginRight: 8,
    },
    trackCheck: {
        color: '#818cf8',
        fontWeight: '700',
        fontSize: 16,
    },
});
