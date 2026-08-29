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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import PostCard, { Post } from '../components/PostCard';
import api from '../api/client';
import { formatNumber, safeString } from '../utils/helpers';
import { resolveMediaUrl } from '../lib/media';

type ProfileTab = 'posts' | 'replies' | 'media';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
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
      const response = await api.get(`/users/${user.id}/profile`);
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
      };
    },
    enabled: !!user,
    retry: 2,
  });

  // ── Fetch user's posts ──
  const {
    data: posts = [],
    isLoading: postsLoading,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: ['user-posts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      try {
        let response;
        try {
          response = await api.get(`/posts?authorId=${user.id}&limit=30`);
        } catch {
          response = await api.get(`/posts?userId=${user.id}&limit=30`);
        }
        const postsData = response.data.data?.posts || response.data.posts || response.data.data || [];
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchPosts()]);
    setRefreshing(false);
  };

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

  if (!user) {
    return (
      <SafeAreaView style={styles.placeholderContainer}>
        <Feather name="user" size={64} color="#d1d5db" />
        <Text style={styles.placeholderTitle}>Not signed in</Text>
        <Text style={styles.placeholderSubtitle}>
          Sign in to view and edit your profile.
        </Text>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => (navigation.navigate as any)('Login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </SafeAreaView>
    );
  }

  if (profileError || !profile) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorTitle}>Failed to load profile</Text>
        <Text style={styles.errorSubtitle}>Please try again later.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6C63FF" />
        }
        showsVerticalScrollIndicator={false}
      >
        {profile.coverImage ? (
          <View style={styles.coverContainer}>
            <Image source={{ uri: profile.coverImage }} style={styles.coverImage} resizeMode="cover" />
            <View style={styles.coverOverlay} />
          </View>
        ) : (
          <View style={styles.coverPlaceholder} />
        )}

        <View style={styles.header}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBorder}>
              <Avatar source={profile.avatar} size={80} fallback={profile.name} />
            </View>
            <View style={styles.headerActions}>
              {profile.isCurrentUser && (
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => (navigation.navigate as any)('Settings')}
                >
                  <Feather name="settings" size={22} color="#1f2937" />
                </TouchableOpacity>
              )}
              {!profile.isCurrentUser && (
                <TouchableOpacity
                  style={[styles.followButton, profile.isFollowed && styles.followButtonActive]}
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

          <Text style={styles.name}>{safeString(profile.name)}</Text>
          <Text style={styles.username}>@{safeString(profile.username)}</Text>

          {profile.bio && <Text style={styles.bio}>{safeString(profile.bio)}</Text>}

          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.statItem}>
              <Text style={styles.statNumber}>{formatNumber(profile.postsCount)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem}>
              <Text style={styles.statNumber}>{formatNumber(profile.followersCount)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem}>
              <Text style={styles.statNumber}>{formatNumber(profile.followingCount)}</Text>
              <Text style={styles.statLabel}>Following</Text>
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
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
                  <Feather name="file-text" size={48} color="#d1d5db" />
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptySubtitle}>When you post, they'll appear here.</Text>
                </View>
              }
            />
          )}
          {activeTab === 'replies' && (
            <View style={styles.emptyState}>
              <Feather name="message-circle" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No replies yet</Text>
              <Text style={styles.emptySubtitle}>When you reply to posts, they'll appear here.</Text>
            </View>
          )}
          {activeTab === 'media' && (
            <View style={styles.emptyState}>
              <Feather name="image" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No media yet</Text>
              <Text style={styles.emptySubtitle}>Your photos and videos will show up here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'white',
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
  },
  signInButton: {
    marginTop: 24,
    backgroundColor: '#6C63FF',
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
    backgroundColor: 'white',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 12,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 4,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#6C63FF',
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
    backgroundColor: '#e5e7eb',
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
    backgroundColor: 'rgba(0,0,0,0.2)',
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
    borderColor: 'white',
    borderRadius: 100,
    backgroundColor: 'white',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsButton: {
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 100,
  },
  followButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#6C63FF',
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
    color: '#1f2937',
    marginTop: 8,
  },
  username: {
    fontSize: 14,
    color: '#6b7280',
  },
  bio: {
    fontSize: 14,
    color: '#374151',
    marginTop: 4,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#6C63FF',
  },
  content: {
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  postsContainer: {
    paddingVertical: 4,
  },
  emptyState: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 16,
  },
  emptySubtitle: {
    color: '#9ca3af',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 4,
  },
});