import { View, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '../../stores/authStore';

export default function LibraryScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    return (
        <View style={styles.container}>
            <View style={styles.centered}>
                {isAuthenticated ? (
                    <>
                        <Text style={styles.icon}>📚</Text>
                        <Text style={styles.title}>Your Library</Text>
                        <Text style={styles.subtitle}>
                            Your saved content will appear here. Browse and add items to your library.
                        </Text>
                    </>
                ) : (
                    <Text style={styles.subtitle}>Sign in to build your library</Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    icon: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#e0e0ff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: '#9ca3af',
        textAlign: 'center',
        lineHeight: 22,
    },
});
