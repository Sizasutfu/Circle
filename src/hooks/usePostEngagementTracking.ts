// src/hooks/usePostEngagementTracking.ts
//
// Tracks engagement when a user opens a post detail screen.
//
//   • If the user stays ≥ 2 seconds → sends `POST /posts/:id/view`
//     with `dwellMs` so the algorithm knows this was a real, engaged
//     read (the "boost" signal).
//
//   • If the user bounces before 2 seconds → sends `POST /posts/:id/skip`
//     (only for logged-in users; guests can't send skips).
//
//   • Both view and skip are recorded at most once per post per session,
//     so navigating away and back doesn't double-count.
//
import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// Minimum dwell (ms) to be considered a "real" read, not a bounce.
const ENGAGEMENT_THRESHOLD_MS = 2000;

// Session-scoped dedup — prevents double views/skips on the same post
// when the screen mounts, unmounts, and mounts again.
const SESSION_VIEWED  = new Set<string>();
const SESSION_SKIPPED = new Set<string>();

export function usePostEngagementTracking(postId: string | undefined) {
  const { user } = useAuth();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!postId || !isFocused) return;
    if (SESSION_VIEWED.has(postId)) return;

    const startedAt = Date.now();
    let viewSent = false;

    // After the threshold, record the view. The dwell value captured
    // here is a floor — a strong signal in its own right even if the
    // user stays for minutes.
    const timer = setTimeout(() => {
      viewSent = true;
      SESSION_VIEWED.add(postId);

      const dwellMs = Date.now() - startedAt;
      api
        .post(`/posts/${postId}/view`, { dwellMs })
        .catch(() => {
          // Non-fatal — analytics shouldn't interrupt the user
        });
    }, ENGAGEMENT_THRESHOLD_MS);

    return () => {
      clearTimeout(timer);

      // Bounced before the threshold → skip signal (logged-in only)
      if (!viewSent && user?.id && !SESSION_SKIPPED.has(postId)) {
        SESSION_SKIPPED.add(postId);
        api.post(`/posts/${postId}/skip`).catch(() => {});
      }
    };
  }, [postId, isFocused, user?.id]);
}