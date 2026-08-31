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

// The backend's /search endpoint returns a single mixed array of posts,
// users, and groups. It tags results with `_type` where it can tell, but
// not always — this mirrors the same inference the web SearchContext does,
// so mobile and web classify ambiguous results identically.
function inferSearchResultType(item: any): SearchResultType {
  if (item._type) return item._type;
  if (item.text !== undefined && item.userId !== undefined) return 'post';
  if (item.topic !== undefined || item.displayName !== undefined) return 'group';
  if (item.email !== undefined || item.username !== undefined) return 'user';
  return 'post';
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
  if (type === 'post') return { ...normalizePost(item), _type: 'post' };
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

// ── Paginated feed for a single topic (e.g. tapping a trending topic) ──
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
  useQuery({
    queryKey: ['explore', 'trending'],
    queryFn: async () => {
      const res = await api.get('/explore/trending');
      const raw = res.data?.data ?? [];
      return raw.map(normalizePost);
    },
    staleTime: 60 * 1000,
  });

// ============================================================
//  PEOPLE
// ============================================================
// Recommendations — NOT a text search, requires a logged-in userId.
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
      // People lists and search results both embed follow state, so both
      // need to reflect the change.
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
  return useInfiniteQuery({
    queryKey: ['explore', 'search', trimmed, type],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get('/search', {
        params: { q: trimmed, type, page: pageParam, limit: SEARCH_PAGE_SIZE },
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
    // Same 2-character floor as the web version — avoids firing a search
    // request on every single keystroke of a one-letter query.
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