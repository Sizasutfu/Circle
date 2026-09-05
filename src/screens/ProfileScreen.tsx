import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
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
  isCurrentUser: boolean;
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useTabBarHeight();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch profile data ──
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not logged in');
      console.log('👤 Fetching profile for user:', user.id);
      
      const response = await api.get(`/users/${user.id}/profile`);
      console.log('📦 Profile response:', JSON.stringify(response.data, null, 2));
      
      const data = response.data;
      const profileData = data.data || data;
      
      return {
        id: String(profileData.id || user.id),
        name: profileData.name || user.name || 'Anonymous',
        username: profileData.username || user.username || user.email?.split('@')[0] || 'user',
        avatar: resolveMediaUrl(profileData.avatar || profileData.picture || user.avatar || null),
        coverImage: resolveMediaUrl(profileData.coverImage || profileData.cover || null),
        bio: profileData.bio || profileData.biography || '',
        postsCount: Number(profileData.postsCount || profileData.postCount || 0),
        followersCount: Number(profileData.followersCount || profileData.followerCount || 0),
        followingCount: Number(profileData.followingCount || profileData.following || 0),
        isFollowed: !!profileData.isFollowed,
        isCurrentUser: true,
      } as ProfileData;
    },
    enabled: !!user,
    retry: 2,
  });

  // ── Fetch ONLY the current user's posts ──
  const {
    data: posts = [],
    isLoading: postsLoading,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ['user-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const currentUserId = String(user.id);
      console.log('📰 Fetching posts for user:', currentUserId);

      try {
        // The backend's GET /posts only recognizes `userId` as the
        // profile-posts filter (see postController.getPosts — it routes to
        // PostModel.getProfilePosts when req.query.userId is present).
        // Any other param name is silently ignored and falls through to
        // the general feed, so this must be `userId`, not `authorId`.
        const response = await api.get(`/posts`, {
          params: { userId: currentUserId, limit: 30 }
        });

        console.log('📦 Posts response:', JSON.stringify(response.data, null, 2));

        let postsData = [];
        if (response.data.data?.posts) {
          postsData = response.data.data.posts;
        } else if (response.data.posts) {
          postsData = response.data.posts;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          postsData = response.data.data;
        } else if (Array.isArray(response.data)) {
          postsData = response.data;
        } else {
          postsData = [];
        }

        return postsData.map((p: any) => ({
          ...p,
          id: String(p.id || ''),
          text: p.text || p.content || '',
          image: resolveMediaUrl(p.image || p.imageUrl || null),
          video: resolveMediaUrl(p.video || p.videoUrl || null),
          user: p.user || {
            id: user.id,
            name: profile?.name || user.name || 'Anonymous',
            username: profile?.username || user.username || '',
            avatar: resolveMediaUrl(profile?.avatar || user.avatar || null),
            verified: false,
          },
          likes: Array.isArray(p.likes) ? p.likes : [],
          comments: Array.isArray(p.comments) ? p.comments : [],
          reposts: Array.isArray(p.reposts) ? p.reposts : [],
          shares: Number(p.shares || 0),
          viewCount: Number(p.viewCount || p.views || 0),
          videoViews: Number(p.videoViews || 0),
          isLive: !!p.isLive,
          commentCount: Number(p.commentCount || 0),
          repostCount: Number(p.repostCount || 0),
          isRepost: !!p.isRepost,
          groupId: p.groupId || null,
          reasons: Array.isArray(p.reasons) ? p.reasons : [],
          originalPost: p.originalPost ? {
            ...p.originalPost,
            text: p.originalPost.text || p.originalPost.content || '',
            image: resolveMediaUrl(p.originalPost.image || null),
            video: resolveMediaUrl(p.originalPost.video || null),
          } : null,
        }));
      } catch (error) {
        console.warn('Error fetching posts:', error);
        return [];
      }
    },
    enabled: !!user,
  });

  // ── Pull to refresh ──
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchPosts()]);
    setRefreshing(false);
  };

  // ── Logout handler ──
  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' as never }],
            });
          },
        },
      ]
    );
  };

  // ── Navigate to Edit Profile ──
  const handleEditProfile = () => {
    (navigation.navigate as any)('EditProfile');
  };

  // ── Render post item ──
  const renderPostItem = ({ item }: { item: Post }) => {
    const postWithUser = {
      ...item,
      text: item.text || '',
      user: item.user || {
        id: user?.id || '',
        name: profile?.name || 'Anonymous',
        username: profile?.username || '',
        avatar: resolveMediaUrl(profile?.avatar || null),
        verified: false,
      },
    };
    return <PostCard post={postWithUser} />;
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

  // ── Loading ──
  if (profileLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Error ──
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

  // ── Main render ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: contentBottomPadding,
        }}
      >
        {/* ─── Cover Image ─── */}
        {profile.coverImage ? (
          <View style={styles.coverContainer}>
            <Image source={{ uri: profile.coverImage }} style={styles.coverImage} resizeMode="cover" />
            <View style={[styles.coverOverlay, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
          </View>
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]} />
        )}

        {/* ─── Profile Header ─── */}
        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatarBorder, { borderColor: colors.surface, backgroundColor: colors.surface }]}>
              <Avatar source={profile.avatar} size={80} fallback={profile.name} />
            </View>
            <View style={styles.headerActions}>
              {profile.isCurrentUser && (
                <>
                  <TouchableOpacity
                    style={[styles.editButton, { borderColor: colors.border }]}
                    onPress={handleEditProfile}
                  >
                    <Text style={[styles.editButtonText, { color: colors.text }]}>Edit Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.settingsButton, { backgroundColor: isDark ? '#374151' : '#f3f4f6' }]}
                    onPress={() => (navigation.navigate as any)('Settings')}
                  >
                    <Feather name="settings" size={22} color={colors.text} />
                  </TouchableOpacity>
                </>
              )}
              {!profile.isCurrentUser && (
                <TouchableOpacity
                  style={[styles.followButton, { backgroundColor: profile.isFollowed ? (isDark ? '#374151' : '#e5e7eb') : colors.primary }, profile.isFollowed && styles.followButtonActive]}
                  onPress={() => console.log('Toggle follow')}
                >
                  <Text
                    style={[styles.followButtonText, profile.isFollowed && styles.followButtonTextActive]}
                  >
                    {profile.isFollowed ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={[styles.name, { color: colors.text }]}>{safeString(profile.name)}</Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>@{safeString(profile.username)}</Text>

          {profile.bio && <Text style={[styles.bio, { color: colors.text }]}>{safeString(profile.bio)}</Text>}

          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.postsCount)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.followersCount)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>{formatNumber(profile.followingCount)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Tabs ─── */}
        <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
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

        {/* ─── Content ─── */}
        <View style={styles.content}>
          {activeTab === 'posts' && (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              renderItem={renderPostItem}
              scrollEnabled={false}
              contentContainerStyle={styles.postsContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="file-text" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>When you post, they'll appear here.</Text>
                </View>
              }
            />
          )}
          {activeTab === 'replies' && (
            <View style={styles.emptyState}>
              <Feather name="message-circle" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No replies yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>When you reply to posts, they'll appear here.</Text>
            </View>
          )}
          {activeTab === 'media' && (
            <View style={styles.emptyState}>
              <Feather name="image" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No media yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Your photos and videos will show up here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  placeholderSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  signInButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signInButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  coverContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  coverPlaceholder: {
    height: 60,
    width: '100%',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: -40,
  },
  avatarBorder: {
    borderWidth: 4,
    borderRadius: 100,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  editButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 100,
  },
  followButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  followButtonActive: {
    backgroundColor: '#e5e7eb',
  },
  followButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  followButtonTextActive: {
    color: '#374151',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  username: {
    fontSize: 14,
  },
  bio: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#6C63FF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#6C63FF',
  },
  content: {
    paddingHorizontal: 4,
  },
  postsContainer: {
    paddingVertical: 4,
  },
  emptyState: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 16,
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 14,
    marginTop: 4,
  },
});