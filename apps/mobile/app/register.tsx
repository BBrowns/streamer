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
import { useAuth } from '../hooks/useAuth';

export default function RegisterScreen() {
    const router = useRouter();
    const { register, isLoading, error } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');

    const handleRegister = async () => {
        try {
            await register({ email, password, displayName: displayName || undefined });
            router.replace('/(tabs)');
        } catch { }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.form}>
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join the streaming universe</Text>

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>
                            {(error as any)?.response?.data?.error || 'Registration failed'}
                        </Text>
                    </View>
                )}

                <TextInput
                    style={styles.input}
                    placeholder="Display Name (optional)"
                    placeholderTextColor="#6b7280"
                    value={displayName}
                    onChangeText={setDisplayName}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#6b7280"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password (min 8 chars)"
                    placeholderTextColor="#6b7280"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <Pressable
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleRegister}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>Create Account</Text>
                    )}
                </Pressable>

                <Pressable onPress={() => router.replace('/login')}>
                    <Text style={styles.linkText}>
                        Already have an account? <Text style={styles.linkBold}>Sign In</Text>
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
