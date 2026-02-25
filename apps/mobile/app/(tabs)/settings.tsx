import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Modal,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
    const { user, isAuthenticated } = useAuthStore();
    const logout = useAuthStore((s) => s.logout);
    const setAuth = useAuthStore((s) => s.setAuth);
    const router = useRouter();
    const queryClient = useQueryClient();

    // Change Password state
    const [pwModalOpen, setPwModalOpen] = useState(false);
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [pwLoading, setPwLoading] = useState(false);

    // Edit Profile state
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [profileLoading, setProfileLoading] = useState(false);

    const handleChangePassword = async () => {
        if (!currentPw || newPw.length < 8) {
            Alert.alert('Error', 'New password must be at least 8 characters');
            return;
        }
        setPwLoading(true);
        try {
            await api.post('/api/auth/change-password', {
                currentPassword: currentPw,
                newPassword: newPw,
            });
            Alert.alert('Success', 'Password changed successfully');
            setPwModalOpen(false);
            setCurrentPw('');
            setNewPw('');
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'Failed to change password');
        } finally {
            setPwLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        setProfileLoading(true);
        try {
            const { data } = await api.patch('/api/auth/profile', { displayName: displayName || undefined });
            // Update local state
            if (user) {
                setAuth(
                    { ...user, displayName: data.user.displayName },
                    useAuthStore.getState().accessToken!,
                    useAuthStore.getState().refreshToken!,
                );
            }
            Alert.alert('Success', 'Profile updated');
            setProfileModalOpen(false);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.error || 'Failed to update profile');
        } finally {
            setProfileLoading(false);
        }
    };

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
                <Pressable style={styles.userCard} onPress={() => {
                    setDisplayName(user?.displayName || '');
                    setProfileModalOpen(true);
                }}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {user?.email?.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>
                            {user?.displayName || user?.email}
                        </Text>
                        <Text style={styles.userEmail}>{user?.email}</Text>
                    </View>
                    <Ionicons name="pencil" size={16} color="#6b7280" />
                </Pressable>
            </View>

            {/* Menu Items */}
            <View style={styles.section}>
                <Pressable
                    style={styles.menuItem}
                    onPress={() => router.push('/addons')}
                >
                    <View style={styles.menuIcon}>
                        <Ionicons name="extension-puzzle" size={20} color="#818cf8" />
                    </View>
                    <View style={styles.menuContent}>
                        <Text style={styles.menuTitle}>Manage Add-ons</Text>
                        <Text style={styles.menuSubtitle}>Install and remove content sources</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                </Pressable>

                <View style={{ height: 8 }} />

                <Pressable
                    style={styles.menuItem}
                    onPress={() => {
                        setCurrentPw('');
                        setNewPw('');
                        setPwModalOpen(true);
                    }}
                >
                    <View style={styles.menuIcon}>
                        <Ionicons name="lock-closed" size={20} color="#818cf8" />
                    </View>
                    <View style={styles.menuContent}>
                        <Text style={styles.menuTitle}>Change Password</Text>
                        <Text style={styles.menuSubtitle}>Update your account password</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                </Pressable>
            </View>

            {/* Logout */}
            <View style={{ flex: 1 }} />
            <Pressable
                style={styles.logoutBtn}
                onPress={() => {
                    logout();
                    queryClient.clear();
                }}
            >
                <Text style={styles.logoutText}>Sign Out</Text>
            </Pressable>

            {/* Change Password Modal */}
            <Modal visible={pwModalOpen} animationType="slide" transparent onRequestClose={() => setPwModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>🔒 Change Password</Text>
                            <Pressable onPress={() => setPwModalOpen(false)}>
                                <Text style={styles.modalClose}>Cancel</Text>
                            </Pressable>
                        </View>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Current password"
                            placeholderTextColor="#6b7280"
                            value={currentPw}
                            onChangeText={setCurrentPw}
                            secureTextEntry
                        />
                        <TextInput
                            style={styles.modalInput}
                            placeholder="New password (min 8 chars)"
                            placeholderTextColor="#6b7280"
                            value={newPw}
                            onChangeText={setNewPw}
                            secureTextEntry
                        />
                        <Pressable
                            style={[styles.modalBtn, pwLoading && { opacity: 0.5 }]}
                            onPress={handleChangePassword}
                            disabled={pwLoading}
                        >
                            {pwLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.modalBtnText}>Update Password</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Edit Profile Modal */}
            <Modal visible={profileModalOpen} animationType="slide" transparent onRequestClose={() => setProfileModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>✏️ Edit Profile</Text>
                            <Pressable onPress={() => setProfileModalOpen(false)}>
                                <Text style={styles.modalClose}>Cancel</Text>
                            </Pressable>
                        </View>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Display name"
                            placeholderTextColor="#6b7280"
                            value={displayName}
                            onChangeText={setDisplayName}
                        />
                        <Pressable
                            style={[styles.modalBtn, profileLoading && { opacity: 0.5 }]}
                            onPress={handleUpdateProfile}
                            disabled={profileLoading}
                        >
                            {profileLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.modalBtnText}>Save</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>
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
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a3e',
        borderRadius: 12,
        padding: 14,
        gap: 12,
    },
    menuIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: 'rgba(129, 140, 248, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuContent: {
        flex: 1,
    },
    menuTitle: {
        color: '#e0e0ff',
        fontWeight: '600',
        fontSize: 15,
    },
    menuSubtitle: {
        color: '#6b7280',
        fontSize: 11,
        marginTop: 2,
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
    },
    logoutText: {
        color: '#f87171',
        fontWeight: '600',
    },
    // Modal styles
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
    modalInput: {
        backgroundColor: '#1a1a3e',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: '#e0e0ff',
        fontSize: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.2)',
    },
    modalBtn: {
        backgroundColor: '#818cf8',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    modalBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
});
