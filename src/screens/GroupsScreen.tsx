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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups } from '../contexts/GroupsContext';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import GroupCard from '../components/GroupCard';
import MyGroupsStrip from '../components/MyGroupsStrip';

export default function GroupsScreen() {
  const navigation = useNavigation();
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

  useEffect(() => {
    if (isInitialLoad) return;
    (async () => {
      if (user) await loadMyGroups();
      await loadGroups(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation.navigate as any)('MainTabs', { screen: 'Feed' });
    }
  }, [navigation]);

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

  const renderListHeader = () => (
    <View>
      {user ? <MyGroupsStrip /> : null}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {'Trending Groups'}
        </Text>
        {groupsList.length > 0 ? (
          <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
            {groupsList.length}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => <GroupCard group={item} />,
    []
  );

  const renderSeparator = () => <View style={styles.separator} />;

  const headerBar = (
    <View style={[styles.header, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backButton}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>
        {'Groups'}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (isInitialLoad) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        {headerBar}
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {headerBar}

      <FlatList
        data={groupsList}
        keyExtractor={(item: any) => String(item.id)}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentBottomPadding + 40 },
        ]}
        ListHeaderComponent={renderListHeader}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
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
              style={{ marginVertical: 20 }}
              color={colors.primary}
            />
          ) : hasMoreGroups ? (
            <TouchableOpacity
              style={[styles.loadMore, { borderColor: colors.border }]}
              onPress={loadMore}
              disabled={loadingGroups}
            >
              <Text
                style={[styles.loadMoreText, { color: colors.textSecondary }]}
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
                style={[styles.emptySubtitle, { color: colors.textSecondary }]}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 4,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  separator: {
    height: 10,
  },
  loadMore: {
    marginTop: 16,
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