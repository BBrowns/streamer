import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../services/api';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [resetToken, setResetToken] = useState<string | null>(null);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        setError('');
        if (!email) {
            setError('Please enter your email');
            return;
        }

        setIsLoading(true);
        try {
            const { data } = await api.post('/api/auth/forgot-password', { email });
            setSubmitted(true);
            // In dev mode, the API returns the reset token for testing
            if (data.resetToken) {
                setResetToken(data.resetToken);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    if (submitted) {
        return (
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.form}>
                    <Text style={styles.icon}>📧</Text>
                    <Text style={styles.title}>Check Your Email</Text>
                    <Text style={styles.subtitle}>
                        If an account exists for {email}, a password reset link has been sent.
                    </Text>

                    {resetToken && (
                        <View style={styles.devBox}>
                            <Text style={styles.devLabel}>🧪 Dev Mode — Reset Token:</Text>
                            <Text style={styles.devToken} selectable>{resetToken}</Text>
                        </View>
                    )}

                    <Pressable
                        style={styles.button}
                        onPress={() => router.push('/reset-password')}
                    >
                        <Text style={styles.buttonText}>Enter Reset Code</Text>
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

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.form}>
                <Text style={styles.title}>Forgot Password</Text>
                <Text style={styles.subtitle}>
                    Enter your email and we'll send you a reset link.
                </Text>

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#6b7280"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                <Pressable
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Send Reset Link</Text>
                    )}
                </Pressable>

                <Pressable onPress={() => router.replace('/login')}>
                    <Text style={styles.linkText}>
                        Remember your password? <Text style={styles.linkBold}>Sign In</Text>
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
    icon: {
        fontSize: 48,
        textAlign: 'center',
        marginBottom: 16,
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
    devBox: {
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.3)',
    },
    devLabel: {
        color: '#818cf8',
        fontWeight: '600',
        fontSize: 12,
        marginBottom: 6,
    },
    devToken: {
        color: '#e0e0ff',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
