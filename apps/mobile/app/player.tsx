import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../stores/playerStore';
import { streamEngineManager } from '../services/streamEngine/StreamEngineManager';
import { useEffect, useRef } from 'react';

// Conditionally import Video for native only
let Video: any = null;
try {
    Video = require('react-native-video').default;
} catch {
    // Web fallback — will use HTML5 video element
}

export default function PlayerScreen() {
    const router = useRouter();
    const { currentStream, isBuffering, setBuffering, setProgress, clearPlayer } =
        usePlayerStore();
    const videoRef = useRef<any>(null);

    const playbackUri = currentStream
        ? streamEngineManager.getPlaybackUri(currentStream)
        : null;

    useEffect(() => {
        return () => {
            // clean up on unmount
        };
    }, []);

    if (!currentStream || !playbackUri) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <Text style={styles.errorText}>No stream selected</Text>
                    <Pressable style={styles.backBtn} onPress={() => router.back()}>
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // Web fallback using HTML5 video
    if (Platform.OS === 'web') {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Pressable style={styles.closeBtn} onPress={() => { clearPlayer(); router.back(); }}>
                        <Text style={styles.closeBtnText}>✕ Close</Text>
                    </Pressable>
                </View>
                <View style={styles.playerContainer}>
                    {/* @ts-ignore — RNW doesn't know about video tag */}
                    <video
                        src={playbackUri}
                        controls
                        autoPlay
                        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                    />
                </View>
                <View style={styles.infoBar}>
                    <Text style={styles.nowPlaying}>
                        🎬 {currentStream.title || currentStream.name || 'Now Playing'}
                    </Text>
                    <Text style={styles.engineLabel}>Engine: HLS</Text>
                </View>
            </View>
        );
    }

    // Native player using react-native-video
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Pressable style={styles.closeBtn} onPress={() => { clearPlayer(); router.back(); }}>
                    <Text style={styles.closeBtnText}>✕ Close</Text>
                </Pressable>
            </View>

            <View style={styles.playerContainer}>
                {isBuffering && (
                    <View style={styles.bufferOverlay}>
                        <ActivityIndicator size="large" color="#818cf8" />
                    </View>
                )}
                {Video && (
                    <Video
                        ref={videoRef}
                        source={{ uri: playbackUri }}
                        style={styles.video}
                        resizeMode="contain"
                        controls
                        onBuffer={({ isBuffering: b }: { isBuffering: boolean }) => setBuffering(b)}
                        onProgress={({ currentTime, seekableDuration }: any) =>
                            setProgress(currentTime, seekableDuration)
                        }
                        onError={(err: any) => {
                            console.error('Video playback error:', err);
                        }}
                    />
                )}
            </View>

            <View style={styles.infoBar}>
                <Text style={styles.nowPlaying}>
                    🎬 {currentStream.title || currentStream.name || 'Now Playing'}
                </Text>
                <Text style={styles.engineLabel}>Engine: HLS</Text>
            </View>
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
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
    closeBtn: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    closeBtnText: {
        color: '#e0e0ff',
        fontWeight: '600',
        fontSize: 14,
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
    engineLabel: {
        color: '#6b7280',
        fontSize: 11,
        marginTop: 2,
    },
    backBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
    },
    backBtnText: {
        color: '#fff',
        fontWeight: '600',
    },
});
