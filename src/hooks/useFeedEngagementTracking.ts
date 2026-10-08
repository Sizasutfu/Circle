// src/hooks/useFeedEngagementTracking.ts
//
// Feed-level view and skip tracking.
//
//   • A post that stays ≥ 3 seconds in view → POST /posts/:id/view
//     (with dwellMs) — the algorithm's positive signal.
//
//   • A post that was in view for 800ms–3s before scrolling away →
//     POST /posts/:id/skip (logged-in only). This is a "glanced but
//     didn't engage" signal.
//
//   • A post scrolled past in under 800ms → ignored. Too fast to mean
//     anything; treating it as a skip would poison the feed for users
//     who scroll quickly.
//
//   • Every post is tracked at most once per session — either as a
//     view or a skip, never both.
//
// Returns { onViewableItemsChanged } so it can be chained with
// useVisibleItems' callback in a single FlatList handler.
//
import { useCallback, useEffect, useRef } from 'react';
import { ViewToken } from 'react-native';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// Threshold for a "view" (positive signal)
const VIEW_THRESHOLD_MS = 3000;

// Lower bound for a "skip" (negative signal)
const SKIP_MIN_MS = 800;

// ── Session-scoped dedup ──
// Shared with usePostEngagementTracking so a post viewed from the
// detail screen doesn't get counted again from the feed.
export const SESSION_VIEWED  = new Set<string>();
export const SESSION_SKIPPED = new Set<string>();

export function useFeedEngagementTracking() {
  const { user } = useAuth();

  // Mirror user in a ref so the returned callback can be stable
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // postId -> timestamp when it first became visible
  const visibleSinceRef = useRef<Map<string, number>>(new Map());

  // postId -> pending view timer
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      visibleSinceRef.current.clear();
    };
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const now = Date.now();
      const currentlyVisible = new Set<string>();

      // ── Posts that are currently visible ──
      for (const v of viewableItems) {
        if (!v.isViewable || !v.item?.id) continue;
        const id = String(v.item.id);
        currentlyVisible.add(id);

        if (visibleSinceRef.current.has(id)) continue;
        if (SESSION_VIEWED.has(id) || SESSION_SKIPPED.has(id)) continue;

        visibleSinceRef.current.set(id, now);

        const timer = setTimeout(() => {
          if (!visibleSinceRef.current.has(id)) return;
          if (SESSION_VIEWED.has(id) || SESSION_SKIPPED.has(id)) return;

          SESSION_VIEWED.add(id);
          const startedAt = visibleSinceRef.current.get(id) ?? now;
          const dwellMs = Date.now() - startedAt;

          api.post(`/posts/${id}/view`, { dwellMs }).catch(() => {});
          timersRef.current.delete(id);
        }, VIEW_THRESHOLD_MS);

        timersRef.current.set(id, timer);
      }

      // ── Posts that just left the screen ──
      for (const [id, startedAt] of Array.from(visibleSinceRef.current.entries())) {
        if (currentlyVisible.has(id)) continue;

        const timer = timersRef.current.get(id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(id);
        }

        const dwell = now - startedAt;
        visibleSinceRef.current.delete(id);

        if (
          userRef.current?.id &&
          dwell >= SKIP_MIN_MS &&
          dwell < VIEW_THRESHOLD_MS &&
          !SESSION_VIEWED.has(id) &&
          !SESSION_SKIPPED.has(id)
        ) {
          SESSION_SKIPPED.add(id);
          api.post(`/posts/${id}/skip`).catch(() => {});
        }
      }
    },
    []
  );

  return { onViewableItemsChanged };
}