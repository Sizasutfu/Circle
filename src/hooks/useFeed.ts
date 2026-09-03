// src/hooks/useFeed.ts
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';
import { Alert } from 'react-native';

const PAGE_SIZE = 20;

// ── Normalize a single post ──
export function normalizePost(raw: any): any {
  const rawUser = raw.user || raw.author || raw.creator || {};
  const user = {
    id: rawUser.id || raw.userId || '',
    name: rawUser.name || raw.displayName || raw.author || 'Anonymous',
    username: rawUser.username || raw.handle || raw.authorUsername || '',
    avatar: resolveMediaUrl(rawUser.picture || rawUser.avatar || raw.authorPicture || rawUser.avatarUrl || null),
    verified: !!rawUser.verified || !!raw.authorVerified,
  };

  let image = raw.image || raw.imageUrl || raw.image_url || null;
  let video = raw.video || raw.videoUrl || raw.video_url || null;

  if (!image && !video && raw.media && Array.isArray(raw.media)) {
    for (const m of raw.media) {
      if (m.type === 'image') { image = m.url || m.uri; break; }
    }
    for (const m of raw.media) {
      if (m.type === 'video') { video = m.url || m.uri; break; }
    }
  }

  image = resolveMediaUrl(image);
  video = resolveMediaUrl(video);

  return {
    id: raw.id || '',
    text: raw.text || raw.content || '',
    image,
    video,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    likes: Array.isArray(raw.likes) ? raw.likes : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    reposts: Array.isArray(raw.reposts) ? raw.reposts : [],
    shares: raw.shares || raw.shareCount || 0,
    viewCount: raw.viewCount || raw.views || 0,
    videoViews: raw.videoViews || raw.video_views || 0,
    isLive: !!raw.isLive,
    liveSessionId: raw.liveSessionId || null,
    commentCount: raw.commentCount ?? (raw.comments ? raw.comments.length : 0),
    repostCount: raw.repostCount ?? (raw.reposts ? raw.reposts.length : 0),
    isRepost: !!raw.isRepost,
    originalPost: raw.originalPost ? normalizePost(raw.originalPost) : null,
    groupId: raw.groupId || raw.group_id || null,
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    user: user,
  };
}

export const useFeed = (tab: 'global' | 'following' = 'global') => {
  return useInfiniteQuery({
    queryKey: ['feed', tab],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await api.get('/posts', {
        params: {
          feed: tab,
          page: pageParam,
          limit: PAGE_SIZE,
        },
      });

      let posts = [];
      let hasMore = false;

      if (response?.data?.data?.posts) {
        posts = response.data.data.posts;
        hasMore = response.data.data.hasMore ?? posts.length === PAGE_SIZE;
      } else if (response?.data?.posts) {
        posts = response.data.posts;
        hasMore = response.data.pagination?.hasMore || posts.length === PAGE_SIZE;
      } else if (Array.isArray(response?.data)) {
        posts = response.data;
        hasMore = posts.length === PAGE_SIZE;
      } else if (Array.isArray(response)) {
        posts = response;
        hasMore = posts.length === PAGE_SIZE;
      }

      if (!Array.isArray(posts)) posts = [];

      const normalized = posts.map(normalizePost);

      return {
        posts: normalized,
        nextPage: hasMore ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
  });
};

// ── Post Actions Hook with currentUser parameter ──
export const usePostActions = (currentUser?: { id: string } | null) => {
  const queryClient = useQueryClient();

  const likePost = async (postId: string) => {
    const userId = currentUser?.id;

    if (!userId) {
      Alert.alert('Error', 'Please log in to like posts');
      return;
    }

    // Optimistic update
    queryClient.setQueryData(['feed'], (oldData: any) => {
      if (!oldData) return oldData;

      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          posts: page.posts.map((post: any) => {
            if (post.id === postId) {
              const isLiked = post.likes?.includes(userId) || false;
              const newLikes = isLiked
                ? (post.likes || []).filter((id: string) => id !== userId)
                : [...(post.likes || []), userId];
              return {
                ...post,
                likes: newLikes,
              };
            }
            return post;
          }),
        })),
      };
    });

    try {
      const response = await api.post(`/posts/${postId}/like`);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      return response.data;
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      console.error('Like failed:', error);
      throw error;
    }
  };

  const unlikePost = async (postId: string) => {
    await likePost(postId);
  };

  const repost = async (postId: string) => {
    const userId = currentUser?.id;

    if (!userId) {
      Alert.alert('Error', 'Please log in to repost');
      throw new Error('User not logged in');
    }

    console.log('🔄 Repost action started for post:', postId);
    console.log('👤 Current user ID:', userId);

    // Find current post state for proper toggle
    let wasReposted = false;
    let currentRepostCount = 0;
    let currentReposts: string[] = [];

    const feedData = queryClient.getQueryData(['feed']) as any;
    if (feedData?.pages) {
      for (const page of feedData.pages) {
        const found = page.posts?.find((p: any) => p.id === postId);
        if (found) {
          wasReposted = found.reposts?.includes(userId) || false;
          currentRepostCount = found.repostCount || found.reposts?.length || 0;
          currentReposts = found.reposts || [];
          break;
        }
      }
    }

    console.log('📊 Current repost state:', { wasReposted, currentRepostCount });

    // Optimistic update - toggle repost state
    queryClient.setQueryData(['feed'], (oldData: any) => {
      if (!oldData) return oldData;

      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          posts: page.posts.map((post: any) => {
            if (post.id === postId) {
              const isCurrentlyReposted = post.reposts?.includes(userId) || false;
              const newReposts = isCurrentlyReposted
                ? (post.reposts || []).filter((id: string) => id !== userId)
                : [...(post.reposts || []), userId];
              const newRepostCount = isCurrentlyReposted
                ? Math.max(0, (post.repostCount || 0) - 1)
                : (post.repostCount || 0) + 1;

              console.log(`📊 Optimistic update: ${isCurrentlyReposted ? 'Unrepost' : 'Repost'}`, {
                oldCount: post.repostCount,
                newCount: newRepostCount,
              });

              return {
                ...post,
                reposts: newReposts,
                repostCount: newRepostCount,
              };
            }
            return post;
          }),
        })),
      };
    });

    try {
      console.log(`📤 Sending repost request for post ${postId}`);
      const response = await api.post(`/posts/${postId}/repost`);
      console.log('✅ Repost response:', response.data);

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      return response.data;
    } catch (error: any) {
      console.error('❌ Repost failed:', error);

      if (error.response) {
        console.error('📊 Error response data:', error.response.data);
        console.error('📊 Error response status:', error.response.status);
      }

      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: ['feed'] });

      const errorMessage = error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Failed to repost. Please try again.';

      Alert.alert('Error', errorMessage);
      throw error;
    }
  };

  const addComment = async (postId: string, text: string) => {
    try {
      await api.post(`/posts/${postId}/comment`, { text });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (error) {
      throw error;
    }
  };

  return { likePost, unlikePost, repost, addComment };
};