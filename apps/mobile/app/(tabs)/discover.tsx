import {
    View,
    Text,
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
            <View className="flex-1 bg-background justify-center items-center p-8">
                <Text className="text-[48px] mb-3">🎬</Text>
                <Text className="text-textMain text-lg font-bold mb-2">Welcome to Streamer</Text>
                <Text className="text-textMuted text-sm text-center mb-5">Sign in to discover movies and shows</Text>
                <Pressable
                    className="bg-primary px-6 py-3 rounded-xl min-w-[44px] min-h-[44px]"
                    onPress={() => router.push('/login')}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                >
                    <Text className="text-white font-bold text-[15px]">Sign In</Text>
                </Pressable>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View className="flex-1 bg-background justify-center items-center p-8">
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
            <View className="flex-1 bg-background justify-center items-center p-8">
                <Text className="text-[48px] mb-3">🔍</Text>
                <Text className="text-textMain text-lg font-bold mb-2">No Content Sources</Text>
                <Text className="text-textMuted text-sm text-center mb-5">
                    Install an add-on in Settings to start discovering content.
                </Text>
                <Pressable
                    className="bg-primary px-6 py-3 rounded-xl min-w-[44px] min-h-[44px]"
                    onPress={() => router.push('/addons')}
                    accessibilityRole="button"
                    accessibilityLabel="Manage add-ons"
                >
                    <Text className="text-white font-bold text-[15px]">Manage Add-ons</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView
            className="flex-1 bg-background"
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
