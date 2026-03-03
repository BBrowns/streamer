import {
    View,
    Text,
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
import { AxiosError } from 'axios';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { clearQueryCache } from '../../services/queryPersister';

function SettingsContent() {
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
        } catch (err: unknown) {
            const errorMessage = err instanceof AxiosError
                ? err.response?.data?.error
                : 'Failed to change password';
            Alert.alert('Error', errorMessage as string || 'Failed to change password');
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
        } catch (err: unknown) {
            const errorMessage = err instanceof AxiosError
                ? err.response?.data?.error
                : 'Failed to update profile';
            Alert.alert('Error', errorMessage as string || 'Failed to update profile');
        } finally {
            setProfileLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <View className="flex-1 bg-background justify-center items-center">
                <Text className="text-textMuted mb-4" accessibilityRole="text">Sign in to manage settings</Text>
                <Pressable
                    className="bg-primary px-6 py-3 rounded-lg min-w-[44px] min-h-[44px] justify-center items-center"
                    onPress={() => router.push('/login')}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in to your account"
                >
                    <Text className="text-white font-bold">Sign In</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-background p-4">
            {/* User Info */}
            <View className="mb-6">
                <Pressable
                    className="flex-row items-center bg-surface rounded-xl p-4 space-x-3 min-h-[56px]"
                    onPress={() => {
                        setDisplayName(user?.displayName || '');
                        setProfileModalOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit profile for ${user?.displayName || user?.email}`}
                    accessibilityHint="Opens profile editor"
                >
                    <View className="w-12 h-12 rounded-full bg-primary justify-center items-center">
                        <Text className="text-white text-xl font-bold" accessibilityElementsHidden>
                            {user?.email?.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View className="flex-1 ml-3">
                        <Text className="text-textMain font-bold text-base">
                            {user?.displayName || user?.email}
                        </Text>
                        <Text className="text-textMuted text-xs">{user?.email}</Text>
                    </View>
                    <Ionicons name="pencil" size={16} color="#6b7280" accessibilityElementsHidden />
                </Pressable>
            </View>

            {/* Menu Items */}
            <View className="mb-6">
                <Pressable
                    className="flex-row items-center bg-surface rounded-xl p-3.5 space-x-3 min-h-[56px]"
                    onPress={() => router.push('/addons')}
                    accessibilityRole="button"
                    accessibilityLabel="Manage add-ons"
                    accessibilityHint="Install and remove content sources"
                >
                    <View className="w-10 h-10 rounded-lg bg-primary/15 justify-center items-center">
                        <Ionicons name="extension-puzzle" size={20} color="#818cf8" accessibilityElementsHidden />
                    </View>
                    <View className="flex-1 ml-3">
                        <Text className="text-textMain font-semibold text-[15px]">Manage Add-ons</Text>
                        <Text className="text-textMuted text-[11px] mt-0.5">Install and remove content sources</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" accessibilityElementsHidden />
                </Pressable>

                <View className="h-2" />

                <Pressable
                    className="flex-row items-center bg-surface rounded-xl p-3.5 space-x-3 min-h-[56px]"
                    onPress={() => {
                        setCurrentPw('');
                        setNewPw('');
                        setPwModalOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Change password"
                    accessibilityHint="Opens password change form"
                >
                    <View className="w-10 h-10 rounded-lg bg-primary/15 justify-center items-center">
                        <Ionicons name="lock-closed" size={20} color="#818cf8" accessibilityElementsHidden />
                    </View>
                    <View className="flex-1 ml-3">
                        <Text className="text-textMain font-semibold text-[15px]">Change Password</Text>
                        <Text className="text-textMuted text-[11px] mt-0.5">Update your account password</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" accessibilityElementsHidden />
                </Pressable>
            </View>

            {/* Logout */}
            <View className="flex-1" />
            <Pressable
                className="bg-error/10 border border-error/30 rounded-xl py-3 items-center min-h-[48px]"
                onPress={() => {
                    logout();
                    queryClient.clear();
                    clearQueryCache();
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityHint="Logs you out and clears cached data"
            >
                <Text className="text-error font-semibold">Sign Out</Text>
            </Pressable>

            {/* Change Password Modal */}
            <Modal visible={pwModalOpen} animationType="slide" transparent onRequestClose={() => setPwModalOpen(false)}>
                <View className="flex-1 bg-black/70 justify-end">
                    <View className="bg-[#0d0d24] rounded-t-2xl p-5 pb-10">
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-textMain text-lg font-bold">🔒 Change Password</Text>
                            <Pressable onPress={() => setPwModalOpen(false)}>
                                <Text className="text-primary font-bold text-[15px]">Cancel</Text>
                            </Pressable>
                        </View>
                        <TextInput
                            className="bg-surface rounded-xl px-4 py-3 text-textMain text-sm mb-3 border border-primary/20"
                            placeholder="Current password"
                            placeholderTextColor="#6b7280"
                            value={currentPw}
                            onChangeText={setCurrentPw}
                            secureTextEntry
                            accessibilityLabel="Current password"
                            autoComplete="current-password"
                        />
                        <TextInput
                            className="bg-surface rounded-xl px-4 py-3 text-textMain text-sm mb-3 border border-primary/20"
                            placeholder="New password (min 8 chars)"
                            placeholderTextColor="#6b7280"
                            value={newPw}
                            onChangeText={setNewPw}
                            secureTextEntry
                            accessibilityLabel="New password, minimum 8 characters"
                            autoComplete="new-password"
                        />
                        <Pressable
                            className={`bg-primary rounded-xl py-3 items-center mt-2 min-h-[48px] ${pwLoading ? 'opacity-50' : ''}`}
                            onPress={handleChangePassword}
                            disabled={pwLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Update password"
                            accessibilityState={{ disabled: pwLoading }}
                        >
                            {pwLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text className="text-white font-bold">Update Password</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Edit Profile Modal */}
            <Modal visible={profileModalOpen} animationType="slide" transparent onRequestClose={() => setProfileModalOpen(false)}>
                <View className="flex-1 bg-black/70 justify-end">
                    <View className="bg-[#0d0d24] rounded-t-2xl p-5 pb-10">
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-textMain text-lg font-bold">✏️ Edit Profile</Text>
                            <Pressable onPress={() => setProfileModalOpen(false)}>
                                <Text className="text-primary font-bold text-[15px]">Cancel</Text>
                            </Pressable>
                        </View>
                        <TextInput
                            className="bg-surface rounded-xl px-4 py-3 text-textMain text-sm mb-3 border border-primary/20"
                            placeholder="Display name"
                            placeholderTextColor="#6b7280"
                            value={displayName}
                            onChangeText={setDisplayName}
                            accessibilityLabel="Display name"
                            autoComplete="name"
                        />
                        <Pressable
                            className={`bg-primary rounded-xl py-3 items-center mt-2 min-h-[48px] ${profileLoading ? 'opacity-50' : ''}`}
                            onPress={handleUpdateProfile}
                            disabled={profileLoading}
                            accessibilityRole="button"
                            accessibilityLabel="Save profile changes"
                            accessibilityState={{ disabled: profileLoading }}
                        >
                            {profileLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text className="text-white font-bold">Save</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

export default function SettingsScreen() {
    return (
        <ErrorBoundary>
            <SettingsContent />
        </ErrorBoundary>
    );
}
