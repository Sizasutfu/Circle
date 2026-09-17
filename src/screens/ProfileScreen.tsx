import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import PostCard, { Post } from '../components/PostCard';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import api from '../api/client';
import { formatNumber, safeString } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

type ProfileTab = 'posts' | 'replies' | 'media';

interface ProfileData {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  coverImage?: string | null;
  bio?: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  isFollowed?: boolean;
  isVerified?: boolean;
  isCurrentUser: boolean;
}

const STICKY_HEADER_HEIGHT = 56;
const SCROLL_THRESHOLD = 120;

// The sticky action button only reveals after the big button in the profile
// header has scrolled fully off-screen. The big button sits around
// y≈246–280 in the scroll content (cover 160 + headerHeight offset + avatar
// row -40 margin + ~34 button height), so we delay its sticky copy to
// ~220-280 to avoid a window where both are visible at once.
const ACTION_REVEAL_START = SCROLL_THRESHOLD + 100; // 220
const ACTION_REVEAL_END = SCROLL_THRESHOLD + 160;   // 280

export default function ProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useTabBarHeight();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [refreshing, setRefreshing] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  const params = route.params as { userId?: string; username?: string } | undefined;
  const targetIdentifier = params?.userId || params?.username || user?.id || '';

  const isNumeric = !isNaN(Number(targetIdentifier)) && targetIdentifier !== '';
  const targetUserId = isNumeric ? targetIdentifier : '';
  const targetUsername = !isNumeric ? targetIdentifier : '';

  const isCurrentUser = targetUserId ? targetUserId === user?.id : targetUsername === user?.username;

  const getProfileEndpoint = () => `/users/${targetUserId || targetUsername}/profile`;

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['profile', targetIdentifier],
    queryFn: async () => {
      if (!targetIdentifier && !user) throw new Error('No user identifier provided');
      const endpoint = getProfileEndpoint();
      const response = await api.get(endpoint);
      const data = response.data;
      const profileData = data.data || data;

      const isFollowed = !!(
        profileData.isFollowed ??
        profileData.isFollowing ??
        profileData.is_followed ??
        profileData.is_following ??
        profileData.following ??
        profileData.followedByMe ??
        profileData.followed_by_me ??
        profileData.amFollowing ??
        profileData.am_following ??
        profileData.followed
      );

      return {
        id: String(profileData.id || targetIdentifier),
        name: profileData.name || 'Anonymous',
        username: profileData.username || 'user',
        avatar: resolveMediaUrl(profileData.avatar || profileData.picture || null),
        coverImage: resolveMediaUrl(profileData.coverImage || profileData.cover || null),
        bio: profileData.bio || profileData.biography || '',
        postsCount: Number(profileData.postsCount || profileData.postCount || 0),
        followersCount: Number(profileData.followersCount || profileData.followerCount || 0),
        followingCount: Number(profileData.followingCount || profileData.following || 0),
        isFollowed,
        isVerified: !!(profileData.isVerified ?? profileData.verified),
        isCurrentUser: isCurrentUser,
      } as ProfileData;
    },
    enabled: !!targetIdentifier || !!user,
    retry: 2,
    staleTime: 0,
  });

  const normalizePost = (p: any): Post => ({
    ...p,
    id: String(p.id || ''),
    text: p.text || p.content || '',
    image: resolveMediaUrl(p.image || p.imageUrl || null),
    video: resolveMediaUrl(p.video || p.videoUrl || null),
    likes: Array.isArray(p.likes) ? p.likes : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    reposts: Array.isArray(p.reposts) ? p.reposts : [],
    shares: Number(p.shares || 0),
    viewCount: Number(p.viewCount || p.views || 0),
    videoViews: Number(p.videoViews || 0),
    isLive: !!p.isLive,
    liveSessionId: p.liveSessionId || null,
    commentCount: Number(p.commentCount || 0),
    repostCount: Number(p.repostCount || 0),
    isRepost: !!p.isRepost,
    groupId: p.groupId || null,
    reasons: Array.isArray(p.reasons) ? p.reasons : [],
    originalPost: p.originalPost
      ? {
          ...p.originalPost,
          id: String(p.originalPost.id || ''),
          text: p.originalPost.text || p.originalPost.content || '',
          image: resolveMediaUrl(p.originalPost.image || p.originalPost.imageUrl || null),
          video: resolveMediaUrl(p.originalPost.video || p.originalPost.videoUrl || null),
          likes: Array.isArray(p.originalPost.likes) ? p.originalPost.likes : [],
          comments: Array.isArray(p.originalPost.comments) ? p.originalPost.comments : [],
          reposts: Array.isArray(p.originalPost.reposts) ? p.originalPost.reposts : [],
          shares: Number(p.originalPost.shares || 0),
          viewCount: Number(p.originalPost.viewCount || p.originalPost.views || 0),
          videoViews: Number(p.originalPost.videoViews || 0),
          isLive: !!p.originalPost.isLive,
          liveSessionId: p.originalPost.liveSessionId || null,
          commentCount: Number(p.originalPost.commentCount || 0),
          repostCount: Number(p.originalPost.repostCount || 0),
          isRepost: false,
          groupId: p.originalPost.groupId || null,
          reasons: [],
        }
      : null,
  });

  const effectiveUserId = profile?.id || targetUserId || user?.id || '';

  const {
    data: postsPages,
    isLoading: postsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchPosts,
  } = useInfiniteQuery({
    queryKey: ['user-posts', effectiveUserId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      if (!effectiveUserId) return { posts: [], hasMore: false, page: pageParam };

      try {
        const response = await api.get(`/posts`, {
          params: { userId: effectiveUserId, page: pageParam, limit: 30 },
        });

        const body = response.data?.data ?? response.data ?? {};
        const rawPosts = body.posts ?? (Array.isArray(body) ? body : []);
        const hasMore = body.hasMore ?? (rawPosts.length === 30);

        return {
          posts: rawPosts.map(normalizePost),
          hasMore,
          page: pageParam,
        };
      } catch (error) {
        console.warn('Error fetching posts:', error);
        return { posts: [], hasMore: false, page: pageParam };
      }
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: !!effectiveUserId,
  });

  const posts = postsPages?.pages.flatMap((pg) => pg.posts) ?? [];

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchPosts()]);
    setRefreshing(false);
  };

  const handleFollowToggle = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please log in to follow users.');
      return;
    }
    if (!profile || followPending) return;

    const wasFollowing = !!profile.isFollowed;
    const prevFollowers = profile.followersCount;

    setFollowPending(true);
    queryClient.setQueryData(['profile', targetIdentifier], (old: ProfileData | undefined) => {
      if (!old) return old;
      return {
        ...old,
        isFollowed: !wasFollowing,
        followersCount: wasFollowing ? Math.max(0, prevFollowers - 1) : prevFollowers + 1,
      };
    });

    try {
      if (wasFollowing) {
        await api.delete(`/follow/${effectiveUserId}`);
      } else {
        await api.post(`/follow/${effectiveUserId}`);
      }
      refetchProfile();
      queryClient.invalidateQueries({ queryKey: ['explore', 'trending'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });
    } catch (error) {
      queryClient.setQueryData(['profile', targetIdentifier], (old: ProfileData | undefined) => {
        if (!old) return old;
        return { ...old, isFollowed: wasFollowing, followersCount: prevFollowers };
      });
      Alert.alert('Error', 'Failed to update follow status.');
    } finally {
      setFollowPending(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleEditProfile = () => {
    (navigation.navigate as any)('EditProfile');
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation.navigate as any)('Feed');
    }
  };

  const openFollowList = (mode: 'followers' | 'following') => {
    (navigation.navigate as any)('FollowList', { userId: effectiveUserId, mode });
  };

  const renderPostItem = ({ item }: { item: Post }) => <PostCard post={item} />;

  // ── Animated scroll value ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = insets.top + STICKY_HEADER_HEIGHT;

  const headerReveal = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 40, SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nameTranslateY = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 40, SCROLL_THRESHOLD],
    outputRange: [8, 0],
    extrapolate: 'clamp',
  });

  // The sticky action button uses its own, later window — so the big button
  // in the profile header is guaranteed to be off-screen by the time the
  // sticky copy starts appearing. No overlap, no duplicate.
  const actionOpacity = scrollY.interpolate({
    inputRange: [ACTION_REVEAL_START, ACTION_REVEAL_END],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const actionTranslateX = scrollY.interpolate({
    inputRange: [ACTION_REVEAL_START, ACTION_REVEAL_END],
    outputRange: [40, 0],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // ── Shared action button ──
  const renderActionButton = (compact: boolean) => {
    if (!profile) return null;

    if (profile.isCurrentUser) {
      return (
        <TouchableOpacity
          style={[
            compact ? styles.editButtonCompact : styles.editButton,
            { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
          ]}
          onPress={handleEditProfile}
          activeOpacity={0.8}
        >
          <Text
            style={[
              compact ? styles.editButtonTextCompact : styles.editButtonText,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            Edit Profile
          </Text>
        </TouchableOpacity>
      );
    }

    const bg = profile.isFollowed
      ? (isDark ? '#374151' : '#e5e7eb')
      : colors.primary;
    const fg = profile.isFollowed ? colors.text : 'white';

    return (
      <TouchableOpacity
        style={[
          compact ? styles.followButtonCompact : styles.followButton,
          { backgroundColor: bg },
        ]}
        onPress={handleFollowToggle}
        disabled={followPending}
        activeOpacity={0.8}
      >
        {followPending ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Text
            style={[
              compact ? styles.followButtonTextCompact : styles.followButtonText,
              { color: fg },
            ]}
            numberOfLines={1}
          >
            {profile.isFollowed ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // ── Not logged in ──
  if (!user) {
    return (
      <SafeAreaView style={[styles.placeholderContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="user" size={64} color={colors.textMuted} />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>Not signed in</Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
          Sign in to view and edit your profile.
        </Text>
        <TouchableOpacity
          style={[styles.signInButton, { backgroundColor: colors.primary }]}
          onPress={() => (navigation.navigate as any)('Login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (profileError || !profile) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load profile</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>Please try again later.</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Always-visible header ──
  const renderStickyHeader = () => (
    <Animated.View
      style={[
        styles.stickyHeader,
        {
          height: headerHeight,
          paddingTop: insets.top,
        },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: colors.background,
            opacity: headerReveal,
          },
        ]}
      />

      <View style={styles.stickyHeaderInner}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.stickyBackButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.stickyTitleWrap,
            {
              opacity: headerReveal,
              transform: [{ translateY: nameTranslateY }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.stickyNameRow}>
            <Text
              style={[styles.stickyName, { color: colors.text }]}
              numberOfLines={1}
            >
              {safeString(profile.name)}
            </Text>
            {profile.isVerified && (
              <VerificationBadge
                size={14}
                color={colors.primary}
                style={styles.stickyVerifiedBadge}
              />
            )}
          </View>
          <Text
            style={[styles.stickyPostCount, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {formatNumber(profile.postsCount)} posts
          </Text>
        </Animated.View>

        {/* Action button uses its own later reveal window so it never
            duplicates the big button in the profile header. */}
        <Animated.View
          style={[
            styles.stickyActionWrap,
            {
              opacity: actionOpacity,
              transform: [{ translateX: actionTranslateX }],
            },
          ]}
        >
          {renderActionButton(true)}
        </Animated.View>
      </View>
    </Animated.View>
  );

  const renderHeader = () => (
    <>
      {profile.coverImage ? (
        <View style={styles.coverContainer}>
          <Image source={{ uri: profile.coverImage }} style={styles.coverImage} resizeMode="cover" />
          <View style={[styles.coverOverlay, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
        </View>
      ) : (
        <View style={[styles.coverPlaceholder, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]} />
      )}

      <View style={styles.header}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarBorder, { backgroundColor: colors.background }]}>
            <Avatar source={profile.avatar} size={80} />
          </View>
          <View style={styles.headerActions}>
            {renderActionButton(false)}
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {safeString(profile.name)}
          </Text>
          {profile.isVerified && (
            <VerificationBadge size={18} color={colors.primary} style={styles.verifiedBadge} />
          )}
        </View>
        <Text style={[styles.username, { color: colors.textSecondary }]}>@{safeString(profile.username)}</Text>

        {profile.bio && <Text style={[styles.bio, { color: colors.text }]}>{safeString(profile.bio)}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.postsCount)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Posts</Text>
          </View>
          <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('followers')} activeOpacity={0.7}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.followersCount)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={() => openFollowList('following')} activeOpacity={0.7}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.followingCount)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {(['posts', 'replies', 'media'] as ProfileTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  // ── Posts tab ──
  if (activeTab === 'posts') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostItem}
          ListHeaderComponent={
            <>
              <View style={{ height: headerHeight }} />
              {renderHeader()}
            </>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentBottomPadding }}
          style={styles.content}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            postsLoading ? null : (
              <View style={styles.emptyState}>
                <Feather name="file-text" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  {profile.isCurrentUser ? "When you post, they'll appear here." : "When they post, they'll appear here."}
                </Text>
              </View>
            )
          }
        />
        {renderStickyHeader()}
      </View>
    );
  }

  // ── Replies / Media tabs ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={{ height: headerHeight }} />
        {renderHeader()}

        <View style={styles.content}>
          {activeTab === 'replies' && (
            <View style={styles.emptyState}>
              <Feather name="message-circle" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No replies yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {profile.isCurrentUser ? "When you reply, they'll appear here." : "When they reply, they'll appear here."}
              </Text>
            </View>
          )}
          {activeTab === 'media' && (
            <View style={styles.emptyState}>
              <Feather name="image" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No media yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {profile.isCurrentUser ? 'Your photos and videos will show up here.' : 'Their photos and videos will show up here.'}
              </Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>
      {renderStickyHeader()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  placeholderSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  signInButton: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  signInButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  errorSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  retryButton: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },

  coverContainer: { height: 160, width: '100%', position: 'relative' },
  coverPlaceholder: { height: 60, width: '100%' },
  coverImage: { width: '100%', height: '100%' },
  coverOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  header: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 8 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: -40,
  },
  avatarBorder: { borderWidth: 4, borderRadius: 100 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: { fontWeight: '600', fontSize: 14 },
  followButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonText: { fontWeight: '600', fontSize: 14 },

  editButtonCompact: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonTextCompact: { fontWeight: '600', fontSize: 13 },
  followButtonCompact: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButtonTextCompact: { fontWeight: '600', fontSize: 13 },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  name: { fontSize: 24, fontWeight: 'bold', flexShrink: 1 },
  verifiedBadge: { marginLeft: 6 },
  username: { fontSize: 14 },
  bio: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', marginTop: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#6C63FF' },
  tabText: { fontSize: 16, fontWeight: '600' },
  tabTextActive: { color: '#6C63FF' },

  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    justifyContent: 'flex-end',
  },
  stickyHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: STICKY_HEADER_HEIGHT,
  },
  stickyBackButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyTitleWrap: {
    flex: 1,
    marginLeft: 8,
  },
  stickyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stickyName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  stickyVerifiedBadge: {
    marginLeft: 4,
  },
  stickyPostCount: {
    fontSize: 12,
    marginTop: 1,
  },
  stickyActionWrap: {
    marginLeft: 8,
  },

  content: { paddingHorizontal: 4 },
  postsContainer: { paddingVertical: 4 },
  emptyState: { paddingVertical: 64, alignItems: 'center' },
  emptyTitle: { textAlign: 'center', marginTop: 8, fontSize: 16 },
  emptySubtitle: { textAlign: 'center', fontSize: 14, marginTop: 4 },
});