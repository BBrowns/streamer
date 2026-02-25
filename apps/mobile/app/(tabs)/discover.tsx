import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAddons } from '../../hooks/useAddons';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogDefinition, InstalledAddon } from '@streamer/shared';
import { useAuthStore } from '../../stores/authStore';
import { CatalogRow } from '../../components/catalog/CatalogRow';
import { ContinueWatchingRow } from '../../components/catalog/ContinueWatchingRow';

export default function DiscoverScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: addons, isLoading } = useAddons();
    const [refreshing, setRefreshing] = useState(false);

    if (!isAuthenticated) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyIcon}>🎬</Text>
                <Text style={styles.emptyTitle}>Welcome to Streamer</Text>
                <Text style={styles.emptyText}>Sign in to discover movies and shows</Text>
                <Pressable
                    style={styles.ctaBtn}
                    onPress={() => router.push('/login')}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                >
                    <Text style={styles.ctaBtnText}>Sign In</Text>
                </Pressable>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#818cf8" />
            </View>
        );
    }

    // Collect all catalogs across all addons (Server-Driven UI)
    const catalogRows: { catalog: CatalogDefinition; addon: InstalledAddon }[] = [];
    addons?.forEach((addon) => {
        addon.manifest.catalogs.forEach((catalog) => {
            catalogRows.push({ catalog, addon });
        });
    });

    if (catalogRows.length === 0) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyTitle}>No Content Sources</Text>
                <Text style={styles.emptyText}>
                    Install an add-on in Settings to start discovering content.
                </Text>
                <Pressable
                    style={styles.ctaBtn}
                    onPress={() => router.push('/addons')}
                    accessibilityRole="button"
                    accessibilityLabel="Manage add-ons"
                >
                    <Text style={styles.ctaBtnText}>Manage Add-ons</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={async () => {
                        setRefreshing(true);
                        await queryClient.invalidateQueries({ queryKey: ['addons'] });
                        await queryClient.invalidateQueries({ queryKey: ['catalog'] });
                        await queryClient.invalidateQueries({ queryKey: ['progress'] });
                        setRefreshing(false);
                    }}
                    tintColor="#818cf8"
                    colors={['#818cf8']}
                />
            }
        >
            {/* Continue Watching — always first if there are items */}
            <ContinueWatchingRow />

            {/* Server-Driven catalog rows from installed add-ons */}
            {catalogRows.map(({ catalog, addon }) => (
                <CatalogRow
                    key={`${addon.id}-${catalog.type}-${catalog.id}`}
                    catalog={catalog}
                    addon={addon}
                />
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a1a',
    },
    centered: {
        flex: 1,
        backgroundColor: '#0a0a1a',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        color: '#e0e0ff',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptyText: {
        color: '#9ca3af',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    ctaBtn: {
        backgroundColor: '#818cf8',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        minWidth: 44,
        minHeight: 44,
    },
    ctaBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
});
