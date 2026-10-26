// src/hooks/useFeed.ts
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
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
    // The feed is ranked, so a background refetch can reorder it under the
    // user's thumb. Only refetch when the user asks (pull-to-refresh) or the
    // data is genuinely old.
    staleTime: 60_000,
  });
};

// ── Cache helper ──
// Patches ONE post in every cached feed (['feed','global'], ['feed','following'], ...).
// Pages/posts that didn't change keep their object identity, so React.memo
// on PostCard skips them. (The old code wrote to the key ['feed'], which is not
// a real cache entry -> the optimistic update silently did nothing.)
function patchPostInFeeds(
  queryClient: QueryClient,
  postId: string,
  patch: (post: any) => any,
) {
  queryClient.setQueriesData<any>({ queryKey: ['feed'] }, (old: any) => {
    if (!old?.pages) return old;
    let changed = false;
    const pages = old.pages.map((page: any) => {
      const idx = (page.posts || []).findIndex((p: any) => String(p.id) === String(postId));
      if (idx === -1) return page;
      changed = true;
      const posts = page.posts.slice();
      posts[idx] = patch(posts[idx]);
      return { ...page, posts };
    });
    return changed ? { ...old, pages } : old;
  });
}

const includesId = (list: any, id: string) =>
  Array.isArray(list) && list.some((x: any) => String(x?.id ?? x) === String(id));

const withoutId = (list: any, id: string) =>
  (Array.isArray(list) ? list : []).filter((x: any) => String(x?.id ?? x) !== String(id));

// Marks feeds stale WITHOUT refetching them now. They refresh next time the
// user pulls to refresh or the data ages out - never mid-interaction.
const markFeedsStale = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'none' });

// ── Post Actions Hook with currentUser parameter ──
export const usePostActions = (currentUser?: { id: string } | null) => {
  const queryClient = useQueryClient();

  // Both toggles are self-inverse, so calling them twice = rollback.
  const toggleLike = (userId: string) => (post: any) => {
    const isLiked = includesId(post.likes, userId);
    return {
      ...post,
      likes: isLiked ? withoutId(post.likes, userId) : [...(post.likes || []), userId],
    };
  };

  const toggleRepost = (userId: string) => (post: any) => {
    const isReposted = includesId(post.reposts, userId);
    const count = post.repostCount ?? (post.reposts ? post.reposts.length : 0);
    return {
      ...post,
      reposts: isReposted ? withoutId(post.reposts, userId) : [...(post.reposts || []), userId],
      repostCount: isReposted ? Math.max(0, count - 1) : count + 1,
    };
  };

  const likePost = async (postId: string) => {
    const userId = currentUser?.id;

    if (!userId) {
      Alert.alert('Error', 'Please log in to like posts');
      return;
    }

    // Optimistic update
    patchPostInFeeds(queryClient, postId, toggleLike(userId));

    try {
      const response = await api.post(`/posts/${postId}/like`);
      markFeedsStale(queryClient);
      return response.data;
    } catch (error) {
      // Roll back locally - no refetch, so the list doesn't move
      patchPostInFeeds(queryClient, postId, toggleLike(userId));
      console.error('Like failed:', error);
      throw error;
    }
  };

  // Server endpoint toggles, so unlike === like
  const unlikePost = async (postId: string) => {
    await likePost(postId);
  };

  const repost = async (postId: string) => {
    const userId = currentUser?.id;

    if (!userId) {
      Alert.alert('Error', 'Please log in to repost');
      throw new Error('User not logged in');
    }

    // Optimistic update - toggle repost state
    patchPostInFeeds(queryClient, postId, toggleRepost(userId));

    try {
      const response = await api.post(`/posts/${postId}/repost`);
      markFeedsStale(queryClient);
      return response.data;
    } catch (error: any) {
      console.error('❌ Repost failed:', error);

      if (error.response) {
        console.error('📊 Error response data:', error.response.data);
        console.error('📊 Error response status:', error.response.status);
      }

      // Rollback optimistic update (no refetch)
      patchPostInFeeds(queryClient, postId, toggleRepost(userId));

      const errorMessage = error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'Failed to repost. Please try again.';

      Alert.alert('Error', errorMessage);
      throw error;
    }
  };

  const addComment = async (postId: string, text: string) => {
    const bump = (delta: number) => (post: any) => ({
      ...post,
      commentCount: Math.max(
        0,
        (post.commentCount ?? (post.comments ? post.comments.length : 0)) + delta,
      ),
    });

    patchPostInFeeds(queryClient, postId, bump(1));
    try {
      await api.post(`/posts/${postId}/comment`, { text });
      markFeedsStale(queryClient);
    } catch (error) {
      patchPostInFeeds(queryClient, postId, bump(-1));
      throw error;
    }
  };

  return { likePost, unlikePost, repost, addComment };
};

// ── Delete Post Hook ──
export const useDeletePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string | number) => {
      await api.delete(`/posts/${postId}`);
    },
    onSuccess: (_data, postId) => {
      // Remove the post from every cached feed list immediately
      queryClient.setQueriesData<any>({ queryKey: ['feed'] }, (old: any) => {
        if (!old) return old;
        // Infinite query shape: { pages: [{ posts: [...] }] }
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              posts: (page.posts || []).filter(
                (p: any) => String(p.id) !== String(postId)
              ),
            })),
          };
        }
        // Flat list shape: { posts: [...] }
        if (old.posts) {
          return {
            ...old,
            posts: old.posts.filter((p: any) => String(p.id) !== String(postId)),
          };
        }
        return old;
      });

      // Refresh other caches that might hold the deleted post
      ['posts', 'profile-posts', 'topic-posts', 'group-posts'].forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });

      // Invalidate the individual post query so PostDetailScreen
      // doesn't keep showing a deleted post
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });
};