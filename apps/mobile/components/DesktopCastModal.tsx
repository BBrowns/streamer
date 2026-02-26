import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, FlatList, ActivityIndicator } from 'react-native';

export interface CastDevice {
    id: string;
    name: string;
    type: string;
}

interface Props {
    visible: boolean;
    playbackUri: string;
    title: string;
    onClose: () => void;
}

export function DesktopCastModal({ visible, playbackUri, title, onClose }: Props) {
    const [devices, setDevices] = useState<CastDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [castingTo, setCastingTo] = useState<string | null>(null);

    const fetchDevices = async () => {
        setLoading(true);
        try {
            // Assumes stream-server is running alongside the desktop app
            const res = await fetch('http://localhost:11470/api/cast/devices');
            if (res.ok) {
                const data = await res.json();
                setDevices(data);
            }
        } catch (e) {
            console.error('Failed to fetch cast devices:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (visible) {
            fetchDevices();
            setCastingTo(null);
        }
    }, [visible]);

    const handleCast = async (device: CastDevice) => {
        setCastingTo(device.id);
        try {
            const res = await fetch('http://localhost:11470/api/cast/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: device.id, url: playbackUri, title }),
            });
            if (res.ok) {
                // Success, could show a toast or auto-close
                setTimeout(onClose, 1000);
            } else {
                console.error('Failed to cast:', await res.text());
                setCastingTo(null);
            }
        } catch (e) {
            console.error('Cast error:', e);
            setCastingTo(null);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Cast to Device</Text>
                        <Pressable onPress={onClose} hitSlop={10}>
                            <Text style={styles.closeBtn}>Done</Text>
                        </Pressable>
                    </View>

                    {loading && devices.length === 0 ? (
                        <ActivityIndicator style={styles.loader} color="#818cf8" />
                    ) : devices.length === 0 ? (
                        <Text style={styles.emptyText}>No devices found on network</Text>
                    ) : (
                        <FlatList
                            data={devices}
                            keyExtractor={(d) => d.id}
                            renderItem={({ item }) => {
                                const isCasting = castingTo === item.id;
                                return (
                                    <Pressable
                                        style={[styles.deviceItem, isCasting && styles.deviceItemActive]}
                                        onPress={() => handleCast(item)}
                                        disabled={castingTo !== null}
                                    >
                                        <Text style={styles.deviceName}>{item.name}</Text>
                                        <Text style={styles.deviceType}>{item.type}</Text>
                                        {isCasting && <ActivityIndicator size="small" color="#818cf8" />}
                                    </Pressable>
                                );
                            }}
                        />
                    )}

                    <Pressable style={styles.refreshBtn} onPress={fetchDevices} disabled={loading}>
                        <Text style={styles.refreshText}>{loading ? 'Scanning...' : 'Refresh Devices'}</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#0d0d24',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 20,
        paddingBottom: 40,
        maxHeight: '60%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeBtn: {
        color: '#818cf8',
        fontSize: 16,
        fontWeight: '600',
    },
    loader: {
        marginVertical: 20,
    },
    emptyText: {
        color: '#9ca3af',
        textAlign: 'center',
        marginVertical: 20,
    },
    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 8,
        marginBottom: 8,
    },
    deviceItemActive: {
        backgroundColor: '#3730a3',
    },
    deviceName: {
        color: '#fff',
        fontSize: 16,
    },
    deviceType: {
        color: '#9ca3af',
        fontSize: 12,
        textTransform: 'uppercase',
    },
    refreshBtn: {
        marginTop: 16,
        padding: 12,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
    },
    refreshText: {
        color: '#e5e7eb',
    },
});
