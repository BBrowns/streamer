import {
    View,
    Text,
    StyleSheet,
    Pressable,
    TextInput,
    Alert,
    FlatList,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import type { InstalledAddon } from '@streamer/shared';

export default function SettingsScreen() {
    const { user, isAuthenticated } = useAuthStore();
    const logout = useAuthStore((s) => s.logout);
    const router = useRouter();
    const queryClient = useQueryClient();
    const [addonUrl, setAddonUrl] = useState('');

    const { data: addons, isLoading } = useQuery<InstalledAddon[]>({
        queryKey: ['addons'],
        queryFn: async () => {
            const { data } = await api.get('/api/addons');
            return data.addons;
        },
        enabled: isAuthenticated,
    });

    const installMutation = useMutation({
        mutationFn: async (url: string) => {
            const { data } = await api.post('/api/addons', { transportUrl: url });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['addons'] });
            setAddonUrl('');
            Alert.alert('Success', 'Add-on installed!');
        },
        onError: (err: any) => {
            Alert.alert('Error', err.response?.data?.error || 'Failed to install add-on');
        },
    });

    const uninstallMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/api/addons/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['addons'] });
        },
    });

    if (!isAuthenticated) {
        return (
            <View style={styles.container}>
                <View style={styles.centered}>
                    <Text style={styles.subtitle}>Sign in to manage settings</Text>
                    <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
                        <Text style={styles.primaryBtnText}>Sign In</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* User Info */}
            <View style={styles.section}>
                <View style={styles.userCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {user?.email?.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.userName}>
                            {user?.displayName || user?.email}
                        </Text>
                        <Text style={styles.userEmail}>{user?.email}</Text>
                    </View>
                </View>
            </View>

            {/* Add-ons */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>📦 Add-ons</Text>
                <View style={styles.addonInput}>
                    <TextInput
                        style={styles.input}
                        placeholder="https://addon-url.com"
                        placeholderTextColor="#6b7280"
                        value={addonUrl}
                        onChangeText={setAddonUrl}
                        autoCapitalize="none"
                    />
                    <Pressable
                        style={[styles.installBtn, installMutation.isPending && styles.disabledBtn]}
                        onPress={() => addonUrl && installMutation.mutate(addonUrl)}
                        disabled={installMutation.isPending}
                    >
                        <Text style={styles.installBtnText}>
                            {installMutation.isPending ? '...' : 'Install'}
                        </Text>
                    </Pressable>
                </View>

                {isLoading ? (
                    <ActivityIndicator color="#818cf8" style={{ marginTop: 16 }} />
                ) : (
                    <FlatList
                        data={addons}
                        keyExtractor={(item) => item.id}
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                            <View style={styles.addonCard}>
                                <View style={styles.addonInfo}>
                                    <Text style={styles.addonName}>{item.manifest.name}</Text>
                                    <Text style={styles.addonDesc} numberOfLines={1}>
                                        {item.manifest.description}
                                    </Text>
                                </View>
                                <Pressable
                                    style={styles.removeBtn}
                                    onPress={() => uninstallMutation.mutate(item.id)}
                                >
                                    <Text style={styles.removeBtnText}>✕</Text>
                                </Pressable>
                            </View>
                        )}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>
                                No add-ons installed. Paste a URL above to get started.
                            </Text>
                        }
                    />
                )}
            </View>

            {/* Logout */}
            <Pressable
                style={styles.logoutBtn}
                onPress={() => {
                    logout();
                    queryClient.clear();
                }}
            >
                <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        padding: 16,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    subtitle: {
        color: '#9ca3af',
        marginBottom: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#e0e0ff',
        marginBottom: 12,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a3e',
        borderRadius: 12,
        padding: 16,
        gap: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#818cf8',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    userName: {
        color: '#e0e0ff',
        fontWeight: '700',
        fontSize: 16,
    },
    userEmail: {
        color: '#9ca3af',
        fontSize: 12,
    },
    addonInput: {
        flexDirection: 'row',
        gap: 8,
    },
    input: {
        flex: 1,
        backgroundColor: '#1a1a3e',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: '#e0e0ff',
        fontSize: 13,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.2)',
    },
    installBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 16,
        borderRadius: 10,
        justifyContent: 'center',
    },
    disabledBtn: {
        opacity: 0.5,
    },
    installBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    addonCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a3e',
        borderRadius: 10,
        padding: 12,
        marginTop: 8,
    },
    addonInfo: {
        flex: 1,
    },
    addonName: {
        color: '#e0e0ff',
        fontWeight: '600',
        fontSize: 14,
    },
    addonDesc: {
        color: '#9ca3af',
        fontSize: 11,
        marginTop: 2,
    },
    removeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeBtnText: {
        color: '#f87171',
        fontWeight: '700',
    },
    emptyText: {
        color: '#6b7280',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
    },
    primaryBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 10,
    },
    primaryBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
    logoutBtn: {
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.3)',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 'auto',
    },
    logoutText: {
        color: '#f87171',
        fontWeight: '600',
    },
});
