import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

type Mode = 'followers' | 'following';

interface RouteParams {
  userId: string;
  mode: Mode;
}

interface UserListItem {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  verified: boolean;
  isFollowed: boolean;
  isCurrentUser: boolean;
  bio?: string;
}

const PAGE_SIZE = 30;

export default function FollowListScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userId, mode } = route.params as RouteParams;
  const { user: currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set());

  const title = mode === 'followers' ? 'Followers' : 'Following';

  // ── Normalize a user from any backend shape ──
  const normalizeUser = (u: any): UserListItem => {
    const rawId = String(u.id ?? u.userId ?? u.user_id ?? '');
    return {
      id: rawId,
      name: u.name || u.author || u.username || 'Anonymous',
      username: u.username || u.handle || '',
      avatar: resolveMediaUrl(u.avatar || u.picture || u.profilePicture || null),
      verified: !!(u.verified || u.isVerified),
      isFollowed:
        typeof u.isFollowed === 'boolean'
          ? u.isFollowed
          : typeof u.is_followed === 'boolean'
          ? u.is_followed
          : !!(u.isFollowing || u.following),
      isCurrentUser: rawId === String(currentUser?.id ?? ''),
      bio: u.bio || u.biography || '',
    };
  };

  // ── Fetch list ──
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['follow-list', mode, userId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const endpoint = mode === 'followers'
        ? `/users/${userId}/followers`
        : `/users/${userId}/following`;

      const response = await api.get(endpoint, {
        params: { page: pageParam, limit: PAGE_SIZE },
      });

      const body = response.data?.data ?? response.data ?? {};
      const rawUsers =
        body.users ??
        body.followers ??
        body.following ??
        (Array.isArray(body) ? body : []);

      const users = Array.isArray(rawUsers) ? rawUsers.map(normalizeUser) : [];
      const hasMore =
        typeof body.hasMore === 'boolean'
          ? body.hasMore
          : users.length === PAGE_SIZE;

      return { users, hasMore, page: pageParam };
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!userId,
  });

  const users = data?.pages.flatMap((p) => p.users) ?? [];

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // ── Follow / unfollow with optimistic update ──
  const handleFollowToggle = useCallback(
    async (target: UserListItem) => {
      if (!currentUser) {
        Alert.alert('Sign In Required', 'Please log in to follow users.');
        return;
      }
      if (target.isCurrentUser) return;
      if (pendingFollows.has(target.id)) return;

      setPendingFollows((prev) => new Set(prev).add(target.id));

      const willFollow = !target.isFollowed;

      // Optimistically flip the flag in every cached page
      queryClient.setQueryData(
        ['follow-list', mode, userId],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              users: page.users.map((u: UserListItem) =>
                u.id === target.id ? { ...u, isFollowed: willFollow } : u
              ),
            })),
          };
        }
      );

      try {
        if (willFollow) {
          await api.post(`/follow/${target.id}`);
        } else {
          await api.delete(`/follow/${target.id}`);
        }

        // Invalidate the profile's follower count so it refreshes
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      } catch (error: any) {
        // Revert on failure
        queryClient.setQueryData(
          ['follow-list', mode, userId],
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                users: page.users.map((u: UserListItem) =>
                  u.id === target.id ? { ...u, isFollowed: !willFollow } : u
                ),
              })),
            };
          }
        );

        console.warn('Follow toggle failed:', error);
        if (error?.response?.status === 401) {
          Alert.alert('Session Expired', 'Please log in again.');
        } else {
          Alert.alert('Error', 'Failed to update follow status.');
        }
      } finally {
        setPendingFollows((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
      }
    },
    [currentUser, mode, userId, pendingFollows, queryClient]
  );

  // ── Render a user row ──
  const renderUser = ({ item }: { item: UserListItem }) => {
    const isPending = pendingFollows.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() =>
          (navigation.navigate as any)('Profile', { userId: item.id })
        }
        activeOpacity={0.7}
      >
        <Avatar source={item.avatar} size={48} fallback={item.name} />

        <View style={styles.rowBody}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.verified && (
              <VerificationBadge size={14} style={styles.verifiedBadge} />
            )}
          </View>

          {!!item.username && (
            <Text
              style={[styles.username, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              @{item.username}
            </Text>
          )}

          {!!item.bio && (
            <Text
              style={[styles.bio, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.bio}
            </Text>
          )}
        </View>

        {!item.isCurrentUser && (
          <TouchableOpacity
            style={[
              styles.followButton,
              item.isFollowed
                ? {
                    backgroundColor: 'transparent',
                    borderColor: colors.border,
                    borderWidth: 1,
                  }
                : { backgroundColor: colors.primary },
              isPending && { opacity: 0.6 },
            ]}
            onPress={() => handleFollowToggle(item)}
            disabled={isPending}
            activeOpacity={0.8}
          >
            {isPending ? (
              <ActivityIndicator
                size="small"
                color={item.isFollowed ? colors.text : 'white'}
              />
            ) : (
              <Text
                style={[
                  styles.followButtonText,
                  { color: item.isFollowed ? colors.text : 'white' },
                ]}
              >
                {item.isFollowed ? 'Following' : 'Follow'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Feather
          name={mode === 'followers' ? 'users' : 'user-plus'}
          size={56}
          color={colors.textMuted}
        />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {mode === 'followers'
            ? 'When people follow this account, they will show up here.'
            : 'When this account follows people, they will show up here.'}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Loading */}
      {isLoading && users.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Failed to load {title.toLowerCase()}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={[
            users.length === 0 ? styles.emptyListContent : styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRight: { width: 32 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  listContent: { paddingTop: 4 },
  emptyListContent: { flexGrow: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  rowBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600' },
  verifiedBadge: { marginLeft: 4 },
  username: { fontSize: 13, marginTop: 1 },
  bio: { fontSize: 12, marginTop: 2 },

  followButton: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: { fontSize: 13, fontWeight: '700' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 16 },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  errorTitle: { fontSize: 17, fontWeight: '600', marginTop: 16 },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: 'white', fontWeight: '600', fontSize: 16 },
});