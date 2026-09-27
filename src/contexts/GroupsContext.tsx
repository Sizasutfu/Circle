import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface Group {
  id: number;
  topic: string;
  displayName?: string;
  description?: string;
  coverImage?: string;
  memberCount: number;
  postCount: number;
  isMember?: boolean;
  createdAt?: string;
  [key: string]: any;
}

interface GroupsContextType {
  groupsList: Group[];
  myGroups: Group[];
  currentGroup: Group | null;
  groupFeed: any[];
  hasMoreGroups: boolean;
  hasMoreGroupFeed: boolean;
  loadingGroups: boolean;
  loadingGroupFeed: boolean;
  loadingMyGroups: boolean;
  isInitialized: boolean;
  refreshKey: number;

  loadGroups: (reset?: boolean) => Promise<void>;
  loadMyGroups: () => Promise<Group[]>;
  loadGroupDetail: (groupId: number | string) => Promise<Group>;
  loadGroupFeed: (groupId: number | string, reset?: boolean) => Promise<void>;
  joinGroup: (groupId: number | string) => Promise<boolean>;
  leaveGroup: (groupId: number | string) => Promise<boolean>;
  postToGroup: (
    groupId: number | string,
    text: string,
    imageUri?: string | null,
    videoUri?: string | null
  ) => Promise<any>;

  setCurrentGroup: React.Dispatch<React.SetStateAction<Group | null>>;
  clearCurrentGroup: () => void;
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [groupsList, setGroupsList] = useState<Group[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [groupFeed, setGroupFeed] = useState<any[]>([]);
  const [hasMoreGroups, setHasMoreGroups] = useState(false);
  const [hasMoreGroupFeed, setHasMoreGroupFeed] = useState(false);
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupFeedPage, setGroupFeedPage] = useState(1);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingGroupFeed, setLoadingGroupFeed] = useState(false);
  const [loadingMyGroups, setLoadingMyGroups] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // ── Ref guards to prevent double-fetch races ──
  const loadingGroupsRef = useRef(false);
  const loadingGroupFeedRef = useRef(false);
  const loadingMyGroupsRef = useRef(false);

  // ── Load user's own groups on auth change ──
  useEffect(() => {
    if (user) {
      loadMyGroups().then(() => setIsInitialized(true));
    } else {
      setMyGroups([]);
      setGroupsList([]);
      setIsInitialized(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadMyGroups = useCallback(async (): Promise<Group[]> => {
    if (!user) return [];
    if (loadingMyGroupsRef.current) return myGroups;

    loadingMyGroupsRef.current = true;
    setLoadingMyGroups(true);

    try {
      const res = await api.get('/groups/mine');
      const groups: Group[] = res.data?.data ?? res.data ?? [];

      setMyGroups(groups);

      // Keep list membership flags in sync
      setGroupsList((prev) =>
        prev.map((g) => ({
          ...g,
          isMember: groups.some((mg) => mg.id === g.id),
        }))
      );

      setCurrentGroup((prev) => {
        if (!prev) return prev;
        return { ...prev, isMember: groups.some((g) => g.id === prev.id) };
      });

      return groups;
    } catch (err) {
      console.warn('[groups] loadMyGroups failed:', err);
      return [];
    } finally {
      loadingMyGroupsRef.current = false;
      setLoadingMyGroups(false);
    }
  }, [user, myGroups]);

  const loadGroups = useCallback(
    async (reset = false) => {
      if (loadingGroupsRef.current) return;

      loadingGroupsRef.current = true;
      setLoadingGroups(true);

      try {
        const page = reset ? 1 : groupsPage;
        const userId = user?.id || null;
        const params: Record<string, any> = { page, limit: 12 };
        if (userId) params.userId = userId;

        const res = await api.get('/groups', { params });
        const body = res.data?.data ?? res.data ?? {};
        const rawGroups: Group[] = body.groups ?? [];
        const hasMore = !!body.hasMore;

        // Ensure isMember is correct even if the server forgot
        const withMembership = rawGroups.map((g) => ({
          ...g,
          isMember: myGroups.some((mg) => mg.id === g.id) || !!g.isMember,
        }));

        setGroupsList((prev) => (reset ? withMembership : [...prev, ...withMembership]));
        setHasMoreGroups(hasMore);
        setGroupsPage(page + 1);
      } catch (err) {
        console.warn('[groups] loadGroups failed:', err);
      } finally {
        loadingGroupsRef.current = false;
        setLoadingGroups(false);
      }
    },
    [groupsPage, myGroups, user?.id]
  );

  const loadGroupDetail = useCallback(
    async (groupId: number | string): Promise<Group> => {
      const res = await api.get(`/groups/${groupId}`);
      const group: Group = res.data?.data ?? res.data;

      // Determine membership from myGroups (or fetch if empty)
      if (user) {
        let memberships = myGroups;
        if (memberships.length === 0) memberships = await loadMyGroups();
        group.isMember = memberships.some((g) => g.id === group.id);
      } else {
        group.isMember = false;
      }

      setCurrentGroup(group);
      return group;
    },
    [myGroups, user, loadMyGroups]
  );

  const loadGroupFeed = useCallback(
    async (groupId: number | string, reset = false) => {
      if (loadingGroupFeedRef.current) return;

      loadingGroupFeedRef.current = true;
      setLoadingGroupFeed(true);

      try {
        const page = reset ? 1 : groupFeedPage;
        const res = await api.get(`/groups/${groupId}/feed`, {
          params: { page, limit: 20 },
        });
        const body = res.data?.data ?? res.data ?? {};
        const posts = body.posts ?? [];
        const hasMore = !!body.hasMore;

        setGroupFeed((prev) => (reset ? posts : [...prev, ...posts]));
        setHasMoreGroupFeed(hasMore);
        setGroupFeedPage(page + 1);
      } catch (err) {
        console.warn('[groups] loadGroupFeed failed:', err);
      } finally {
        loadingGroupFeedRef.current = false;
        setLoadingGroupFeed(false);
      }
    },
    [groupFeedPage]
  );

  const joinGroup = useCallback(
    async (groupId: number | string): Promise<boolean> => {
      if (!user) throw new Error('Not authenticated');

      const res = await api.post(`/groups/${groupId}/join`);
      const data = res.data?.data ?? res.data ?? {};
      const memberCount = data.memberCount;

      setCurrentGroup((prev) =>
        !prev || prev.id !== Number(groupId)
          ? prev
          : {
              ...prev,
              isMember: true,
              memberCount: memberCount ?? (prev.memberCount || 0) + 1,
            }
      );

      setGroupsList((prev) =>
        prev.map((g) =>
          g.id === Number(groupId)
            ? {
                ...g,
                isMember: true,
                memberCount: memberCount ?? (g.memberCount || 0) + 1,
              }
            : g
        )
      );

      await loadMyGroups();
      setRefreshKey((k) => k + 1);
      return true;
    },
    [user, loadMyGroups]
  );

  const leaveGroup = useCallback(
    async (groupId: number | string): Promise<boolean> => {
      if (!user) throw new Error('Not authenticated');

      const res = await api.delete(`/groups/${groupId}/join`);
      const data = res.data?.data ?? res.data ?? {};
      const memberCount = data.memberCount;

      setCurrentGroup((prev) =>
        !prev || prev.id !== Number(groupId)
          ? prev
          : {
              ...prev,
              isMember: false,
              memberCount: memberCount ?? Math.max(0, (prev.memberCount || 0) - 1),
            }
      );

      setGroupsList((prev) =>
        prev.map((g) =>
          g.id === Number(groupId)
            ? {
                ...g,
                isMember: false,
                memberCount: memberCount ?? Math.max(0, (g.memberCount || 0) - 1),
              }
            : g
        )
      );

      await loadMyGroups();
      setRefreshKey((k) => k + 1);
      return true;
    },
    [user, loadMyGroups]
  );

  const postToGroup = useCallback(
    async (
      groupId: number | string,
      text: string,
      imageUri?: string | null,
      videoUri?: string | null
    ) => {
      if (!user) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('text', text);
      formData.append('groupId', String(groupId));

      if (imageUri) {
        const name = imageUri.split('/').pop() || 'photo.jpg';
        const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
        formData.append('image', { uri: imageUri, name, type } as any);
      }

      if (videoUri) {
        const name = videoUri.split('/').pop() || 'video.mp4';
        formData.append('video', { uri: videoUri, name, type: 'video/mp4' } as any);
      }

      const res = await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const newPost = res.data?.data ?? res.data;
      setGroupFeed((prev) => [newPost, ...prev]);
      return newPost;
    },
    [user]
  );

  const clearCurrentGroup = useCallback(() => {
    setCurrentGroup(null);
    setGroupFeed([]);
    setGroupFeedPage(1);
    setHasMoreGroupFeed(false);
  }, []);

  const value: GroupsContextType = {
    groupsList,
    myGroups,
    currentGroup,
    groupFeed,
    hasMoreGroups,
    hasMoreGroupFeed,
    loadingGroups,
    loadingGroupFeed,
    loadingMyGroups,
    isInitialized,
    refreshKey,
    loadGroups,
    loadMyGroups,
    loadGroupDetail,
    loadGroupFeed,
    joinGroup,
    leaveGroup,
    postToGroup,
    setCurrentGroup,
    clearCurrentGroup,
  };

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): GroupsContextType {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within a GroupsProvider');
  return ctx;
}