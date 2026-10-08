// src/lib/comments.ts
//
// Shared helpers for normalizing and flattening comment trees.
// Used by PostDetailScreen and CommentSheet.

import { resolveMediaUrl } from './media';

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
  parentId?: string | null;
  replies?: Comment[];
  user: {
    id: string;
    name: string;
    username: string;
    avatar?: string | null;
    verified?: boolean;
  };
}

export interface FlatComment extends Comment {
  _depth: number;
}

export function normalizeComment(c: any): Comment {
  const commentUser = c.user || {};
  const rawReplies = Array.isArray(c.replies) ? c.replies : [];

  return {
    id: String(c.id || c._id || Math.random()),
    text: c.text || c.content || '',
    createdAt: c.createdAt || c.created_at || new Date().toISOString(),
    parentId: c.parentId || c.parent_id || null,
    replies: rawReplies.map(normalizeComment),
    user: {
      id: String(commentUser.id || c.userId || c.authorId || ''),
      name:
        commentUser.name ||
        c.author ||
        commentUser.username ||
        c.user?.username ||
        'Anonymous',
      username:
        commentUser.username || c.authorUsername || c.user?.username || '',
      avatar: resolveMediaUrl(
        commentUser.avatar ||
          commentUser.picture ||
          c.authorPicture ||
          c.user?.avatar ||
          null
      ),
      verified: !!commentUser.verified || !!c.authorVerified,
    },
  };
}

export function flattenComments(
  comments: Comment[],
  depth = 0
): FlatComment[] {
  const result: FlatComment[] = [];
  for (const c of comments) {
    result.push({ ...c, _depth: depth });
    if (c.replies && c.replies.length) {
      result.push(...flattenComments(c.replies, depth + 1));
    }
  }
  return result;
}

// Normalize whichever shape the API returns into a Comment[].
export function extractCommentsFromResponse(data: any): Comment[] {
  let raw: any = data?.data ?? data;

  if (!Array.isArray(raw)) {
    raw =
      raw?.comments ||
      raw?.data?.comments ||
      raw?.results ||
      raw?.data?.results ||
      [];
  }

  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeComment);
}