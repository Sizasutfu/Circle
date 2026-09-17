// src/hooks/useExplore.ts
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';
import { normalizePost } from './useFeed';

const SEARCH_PAGE_SIZE = 20;

// ============================================================
//  TYPES
// ============================================================
export interface Topic {
  topic: string;
  post_count: number;
}

export interface ExplorePerson {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  verified: boolean;
  postCount: number;
  followerCount: number;
  reasons: string[];
  createdAt: string | null;
}

export type SearchResultType = 'post' | 'user' | 'group';

const SEARCH_TYPE_TO_API: Record<'all' | SearchResultType, string> = {
  all: 'all',
  post: 'posts',
  user: 'people',
  group: 'groups',
};

// ============================================================
//  NORMALIZERS
// ============================================================
function normalizePerson(raw: any): ExplorePerson {
  return {
    id: raw.id,
    name: raw.name || 'Anonymous',
    username: raw.username || '',
    avatar: resolveMediaUrl(raw.avatar || raw.picture || raw.avatarUrl || null),
    verified: raw.verified === 1 || raw.verified === true,
    postCount: raw.post_count ?? raw.postCount ?? 0,
    followerCount: raw.follower_count ?? raw.followerCount ?? 0,
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    createdAt: raw.createdAt || raw.created_at || null,
  };
}

function inferSearchResultType(item: any): SearchResultType {
  if (item._type) return item._type;
  if (item.text !== undefined && item.userId !== undefined) return 'post';
  if (item.topic !== undefined || item.displayName !== undefined) return 'group';
  if (item.email !== undefined || item.username !== undefined) return 'user';
  return 'post';
}

/**
 * The /search endpoint returns posts with the author data in one of two
 * shapes depending on whether the backend ran the posts through
 * `hydratePosts` first:
 *
 *   Nested:  { user: { id, name, username, picture, verified } }
 *   Flat:    { userId, author, authorUsername, authorPicture, authorVerified }
 *
 * PostCard reads `post.user.{name,username,avatar,verified}`, so we
 * coalesce both shapes into that canonical nested object here. This is
 * why search results previously fell through to PostCard's
 * `user?.name || 'Anonymous'` default — normalizePost looks for
 * `raw.user.*`, but the flat shape has none of those fields.
 */
function buildCanonicalUser(item: any) {
  const rawUser = item.user || {};

  const id =
    rawUser.id ??
    rawUser.userId ??
    item.userId ??
    item.user_id;

  const name =
    rawUser.name ??
    rawUser.author ??
    item.author ??
    item.authorName ??
    item.name;

  const username =
    rawUser.username ??
    item.authorUsername ??
    item.username;

  const picture =
    rawUser.avatar ??
    rawUser.picture ??
    item.authorPicture ??
    item.avatar ??
    item.picture;

  const verified = !!(
    rawUser.verified ??
    item.authorVerified ??
    item.verified
  );

  return {
    id: String(id ?? ''),
    name: name || 'Anonymous',
    username: username || '',
    avatar: picture ? resolveMediaUrl(picture) : null,
    verified,
  };
}

export interface SearchResultPost {
  _type: 'post';
  [key: string]: any;
}
export interface SearchResultUser extends ExplorePerson {
  _type: 'user';
}
export interface SearchResultGroup {
  _type: 'group';
  [key: string]: any;
}
export type SearchResult = SearchResultPost | SearchResultUser | SearchResultGroup;

function normalizeSearchResult(item: any): SearchResult {
  const type = inferSearchResultType(item);

  if (type === 'post') {
    return {
      ...normalizePost(item),
      _type: 'post',
      // Explicit user override — normalizePost already ran, but if the
      // search endpoint sent flat author fields it would have missed them.
      user: buildCanonicalUser(item),
    };
  }

  if (type === 'user') return { ...normalizePerson(item), _type: 'user' };
  return { ...item, _type: 'group' };
}

// ============================================================
//  TOPICS
// ============================================================
export const useTopics = (limit = 20) =>
  useQuery({
    queryKey: ['explore', 'topics', limit],
    queryFn: async () => {
      const res = await api.get('/topics', { params: { limit } });
      return (res.data?.data ?? []) as Topic[];
    },
    staleTime: 5 * 60 * 1000,
  });

export const useFollowTopic = () =>
  useMutation({
    mutationFn: async (topic: string) => {
      await api.post(`/topics/${encodeURIComponent(topic)}/follow`);
    },
  });

export const useTopicFeed = (topic: string | null) =>
  useInfiniteQuery({
    queryKey: ['explore', 'topic-feed', topic],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get(`/topics/${encodeURIComponent(topic as string)}/posts`, {
        params: { page: pageParam },
      });
      const { posts = [], hasMore = false } = res.data?.data ?? {};
      return {
        posts: posts.map(normalizePost),
        nextPage: hasMore ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 1,
    enabled: !!topic,
  });

// ============================================================
//  TRENDING POSTS
// ============================================================
export const useTrendingPosts = () =>
  useInfiniteQuery({
    queryKey: ['explore', 'trending'],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get('/explore/trending', {
        params: {
          page: pageParam,
          limit: 20,
        },
      });

      const raw = res.data?.data?.posts ?? res.data?.data ?? [];
      const hasMore = res.data?.data?.hasMore ?? raw.length === 20;

      return {
        posts: raw.map((post: any) => ({
          ...normalizePost(post),
          trendingScore: post.trendingScore || post.score || 0,
          rank: post.rank || 0,
        })),
        nextPage: hasMore ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 1,
    staleTime: 60 * 1000,
  });

// ============================================================
//  PEOPLE
// ============================================================
export const useRecommendedPeople = (userId?: number | string, limit = 12) =>
  useQuery({
    queryKey: ['explore', 'people', userId, limit],
    queryFn: async () => {
      const res = await api.get('/recommendations', { params: { userId, limit } });
      const raw = res.data?.data ?? [];
      return raw.map(normalizePerson) as ExplorePerson[];
    },
    enabled: !!userId,
  });

export const useNewMembers = (limit = 20) =>
  useQuery({
    queryKey: ['explore', 'new-members', limit],
    queryFn: async () => {
      const res = await api.get('/users/new-members', { params: { limit } });
      const raw = res.data?.data ?? [];
      return raw.map(normalizePerson) as ExplorePerson[];
    },
  });

export const useFollowToggle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: number; isFollowing: boolean }) => {
      if (isFollowing) {
        await api.delete(`/unfollow/${userId}`);
      } else {
        await api.post(`/follow/${userId}`);
      }
      return { userId, isFollowing: !isFollowing };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explore', 'people'] });
      queryClient.invalidateQueries({ queryKey: ['explore', 'new-members'] });
      queryClient.invalidateQueries({ queryKey: ['explore', 'search'] });
    },
  });
};

// ============================================================
//  UNIFIED SEARCH
// ============================================================
export const useExploreSearch = (query: string, type: 'all' | SearchResultType = 'all') => {
  const trimmed = query.trim();
  const apiType = SEARCH_TYPE_TO_API[type] ?? 'all';
  return useInfiniteQuery({
    queryKey: ['explore', 'search', trimmed, type],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get('/search', {
        params: { q: trimmed, type: apiType, page: pageParam, limit: SEARCH_PAGE_SIZE },
      });
      const body = res.data;
      let data: any[] = [];
      let hasMoreData = false;

      if (body && typeof body === 'object') {
        if (Array.isArray(body.data)) data = body.data;
        else if (Array.isArray(body)) data = body;

        if (body.meta?.hasMore !== undefined) hasMoreData = body.meta.hasMore;
        else if (body.hasMore !== undefined) hasMoreData = body.hasMore;
        else hasMoreData = data.length === SEARCH_PAGE_SIZE;
      }

      return {
        results: data.map(normalizeSearchResult),
        nextPage: hasMoreData ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 1,
    enabled: trimmed.length >= 2,
  });
};

// ============================================================
//  SEARCH HISTORY
// ============================================================
export const useSearchHistory = () =>
  useQuery({
    queryKey: ['search', 'history'],
    queryFn: async () => {
      const res = await api.get('/search/history');
      const body = res.data;
      if (Array.isArray(body?.data)) return body.data;
      if (Array.isArray(body)) return body;
      return [];
    },
  });

export const useSaveSearchHistory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ query, tab }: { query: string; tab: string }) => {
      const res = await api.post('/search/history', { query, tab });
      return res.data?.data;
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(['search', 'history'], data);
    },
  });
};

export const useDeleteSearchHistoryEntry = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | number) => {
      const res = await api.delete(`/search/history/${id}`);
      return res.data?.data;
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(['search', 'history'], data);
      else queryClient.invalidateQueries({ queryKey: ['search', 'history'] });
    },
  });
};

export const useClearSearchHistory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/search/history');
    },
    onSuccess: () => queryClient.setQueryData(['search', 'history'], []),
  });
};