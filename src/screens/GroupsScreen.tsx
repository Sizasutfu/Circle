import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups } from '../contexts/GroupsContext';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import GroupCard from '../components/GroupCard';
import MyGroupsStrip from '../components/MyGroupsStrip';

export default function GroupsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();

  const {
    groupsList,
    hasMoreGroups,
    loadingGroups,
    loadGroups,
    loadMyGroups,
    refreshKey,
  } = useGroups();

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Initial load
  useEffect(() => {
    const run = async () => {
      try {
        if (user) await loadMyGroups();
        await loadGroups(true);
      } finally {
        setIsInitialLoad(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Re-sync when refreshKey bumps (after join/leave)
  useEffect(() => {
    if (isInitialLoad) return;
    (async () => {
      if (user) await loadMyGroups();
      await loadGroups(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (user) await loadMyGroups();
      await loadGroups(true);
    } finally {
      setRefreshing(false);
    }
  }, [user, loadMyGroups, loadGroups]);

  const loadMore = () => {
    if (!loadingGroups && hasMoreGroups) loadGroups(false);
  };

  // ── Header rendered as a component (not a fragment element) ──
  const renderListHeader = () => (
    <View>
      {user ? <MyGroupsStrip /> : null}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {'Trending Groups'}
      </Text>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => <GroupCard group={item} />,
    []
  );

  if (isInitialLoad) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {'Groups'}
          </Text>
        </View>
        <ActivityIndicator
          style={{ marginTop: 40 }}
          color={colors.primary}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {'Groups'}
        </Text>
      </View>

      <FlatList
        data={groupsList}
        keyExtractor={(item: any) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentBottomPadding + 40 },
        ]}
        ListHeaderComponent={renderListHeader}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingGroups && groupsList.length > 0 ? (
            <ActivityIndicator
              style={{ marginVertical: 16 }}
              color={colors.primary}
            />
          ) : hasMoreGroups ? (
            <TouchableOpacity
              style={[styles.loadMore, { borderColor: colors.border }]}
              onPress={loadMore}
              disabled={loadingGroups}
            >
              <Text
                style={[
                  styles.loadMoreText,
                  { color: colors.textSecondary },
                ]}
              >
                {loadingGroups ? 'Loading…' : 'Load more'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          loadingGroups ? null : (
            <View style={styles.empty}>
              <Feather name="users" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {'No groups yet'}
              </Text>
              <Text
                style={[
                  styles.emptySubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {'Check back soon for new communities.'}
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  loadMore: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '500',
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
});