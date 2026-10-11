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
    parentId: c.parentId ?? c.parent_id ?? null,
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

// ── Turn a flat list into a nested tree, keyed by parentId ──
function nestFlatComments(flat: Comment[]): Comment[] {
  const byId = new Map<string, Comment & { replies: Comment[] }>();

  // First pass: create a mutable node for every comment
  for (const c of flat) {
    byId.set(c.id, { ...c, replies: [] });
  }

  const roots: Comment[] = [];

  // Second pass: link children to parents
  for (const c of flat) {
    const node = byId.get(c.id)!;
    const parentId = c.parentId != null ? String(c.parentId) : null;

    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort every level chronologically (oldest first). Replies are sorted
  // within their parent so the thread reads top-down like a conversation.
  const sortByTime = (a: Comment, b: Comment) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

  const sortRecursive = (nodes: Comment[]) => {
    nodes.sort(sortByTime);
    for (const n of nodes) {
      if (n.replies && n.replies.length > 0) sortRecursive(n.replies);
    }
  };
  sortRecursive(roots);

  return roots;
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

// Normalize whichever shape the API returns into a nested Comment[].
// Handles:
//   - already-nested trees (comments have `replies` arrays with content)
//   - flat lists (comments carry `parentId` — they get nested here)
//   - wrapped responses (`{ data: { comments: [...] } }` etc.)
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

  const normalized = raw.map(normalizeComment);

  // If the backend already returned a nested tree (any comment has
  // populated replies), trust it and skip re-nesting.
  const alreadyNested = normalized.some(
    (c) => Array.isArray(c.replies) && c.replies.length > 0
  );
  if (alreadyNested) return normalized;

  // Otherwise build the tree from parentId.
  return nestFlatComments(normalized);
}