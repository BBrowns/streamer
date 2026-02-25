import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../services/api';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleReset = async () => {
        setError('');

        if (!token) {
            setError('Please enter the reset token');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/api/auth/reset-password', { token, newPassword });
            Alert.alert(
                'Password Reset',
                'Your password has been reset. Please sign in.',
                [{ text: 'Sign In', onPress: () => router.replace('/login') }],
            );
        } catch (err: any) {
            setError(err.response?.data?.error || 'Reset failed. Token may be expired.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.form}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                    Enter the reset token from your email and choose a new password.
                </Text>

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                <TextInput
                    style={styles.input}
                    placeholder="Reset token"
                    placeholderTextColor="#6b7280"
                    value={token}
                    onChangeText={setToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <TextInput
                    style={styles.input}
                    placeholder="New password (min 8 chars)"
                    placeholderTextColor="#6b7280"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                />
                <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor="#6b7280"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                />

                <Pressable
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleReset}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Reset Password</Text>
                    )}
                </Pressable>

                <Pressable onPress={() => router.replace('/login')}>
                    <Text style={styles.linkText}>
                        Back to <Text style={styles.linkBold}>Sign In</Text>
                    </Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        justifyContent: 'center',
    },
    form: {
        paddingHorizontal: 32,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#e0e0ff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#9ca3af',
        marginBottom: 28,
        lineHeight: 22,
    },
    errorBox: {
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        color: '#f87171',
        fontSize: 13,
    },
    input: {
        backgroundColor: '#1a1a3e',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#e0e0ff',
        fontSize: 15,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.2)',
    },
    button: {
        backgroundColor: '#818cf8',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 20,
        shadowColor: '#818cf8',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    linkText: {
        color: '#9ca3af',
        textAlign: 'center',
        fontSize: 13,
    },
    linkBold: {
        color: '#818cf8',
        fontWeight: '700',
    },
});
