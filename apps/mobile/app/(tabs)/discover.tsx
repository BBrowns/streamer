import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Image,
    Pressable,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAddons } from '../../hooks/useAddons';
import { useAddonCatalog } from '../../hooks/useAddonCatalog';
import { useQueryClient } from '@tanstack/react-query';
import type { MetaPreview, CatalogDefinition, InstalledAddon } from '@streamer/shared';
import { useAuthStore } from '../../stores/authStore';

/** A single horizontal row for one catalog */
function CatalogRow({ catalog, addon }: { catalog: CatalogDefinition; addon: InstalledAddon }) {
    const { data, isLoading } = useAddonCatalog(catalog.type);
    const router = useRouter();

    if (isLoading) {
        return (
            <View style={styles.rowContainer}>
                <Text style={styles.rowTitle}>{catalog.name}</Text>
                <ActivityIndicator color="#818cf8" style={{ marginVertical: 20 }} />
            </View>
        );
    }

    if (!data || data.length === 0) return null;

    return (
        <View style={styles.rowContainer}>
            <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{catalog.name}</Text>
                <Text style={styles.rowSource}>{addon.manifest.name}</Text>
            </View>
            <FlatList
                horizontal
                data={data.slice(0, 20)}
                keyExtractor={(item) => `${addon.id}-${catalog.id}-${item.id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rowScroll}
                renderItem={({ item }) => (
                    <Pressable
                        style={styles.card}
                        onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
                    >
                        <Image source={{ uri: item.poster }} style={styles.poster} />
                        <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.name}
                        </Text>
                        {!!item.imdbRating && (
                            <Text style={styles.rating}>⭐ {item.imdbRating}</Text>
                        )}
                    </Pressable>
                )}
            />
        </View>
    );
}

export default function DiscoverScreen() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: addons, isLoading } = useAddons();
    const [refreshing, setRefreshing] = useState(false);

    if (!isAuthenticated) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyText}>Sign in to discover content</Text>
                <Pressable style={styles.ctaBtn} onPress={() => router.push('/login')}>
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

    // Collect all catalogs across all addons
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
                <Pressable style={styles.ctaBtn} onPress={() => router.push('/addons')}>
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
                        setRefreshing(false);
                    }}
                    tintColor="#818cf8"
                    colors={['#818cf8']}
                />
            }
        >
            {catalogRows.map(({ catalog, addon }) => (
                <CatalogRow
                    key={`${addon.id}-${catalog.id}`}
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
        paddingVertical: 10,
        borderRadius: 10,
    },
    ctaBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
    rowContainer: {
        marginBottom: 24,
    },
    rowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    rowTitle: {
        color: '#e0e0ff',
        fontSize: 17,
        fontWeight: '700',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    rowSource: {
        color: '#6b7280',
        fontSize: 11,
    },
    rowScroll: {
        paddingHorizontal: 12,
        gap: 10,
    },
    card: {
        width: 120,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#1a1a3e',
    },
    poster: {
        width: 120,
        height: 180,
        backgroundColor: '#2a2a4e',
    },
    cardTitle: {
        color: '#e0e0ff',
        fontSize: 11,
        fontWeight: '600',
        paddingHorizontal: 6,
        paddingTop: 6,
        paddingBottom: 2,
    },
    rating: {
        color: '#fbbf24',
        fontSize: 10,
        fontWeight: '600',
        paddingHorizontal: 6,
        paddingBottom: 6,
    },
});
