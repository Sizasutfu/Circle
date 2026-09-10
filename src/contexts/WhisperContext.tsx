import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import api from '../api/client';

export interface WhisperMessage {
  id: string;
  message: string;
  created_at: string;
  posted?: boolean;
}

export interface WhisperSettings {
  enabled: boolean;
  link_slug: string;
}

interface WhisperContextValue {
  messages: WhisperMessage[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  settings: WhisperSettings;
  fetchInbox: (cursor?: string | null) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  reportMessage: (id: string) => Promise<void>;
  fetchSettings: () => Promise<void>;
  updateSettings: (enabled: boolean) => Promise<any>;
  regenerateSlug: () => Promise<string | undefined>;
}

const WhisperContext = createContext<WhisperContextValue | null>(null);

export function WhisperProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [messages, setMessages] = useState<WhisperMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<WhisperSettings>({ enabled: false, link_slug: '' });

  const fetchInbox = useCallback(async (cursorParam: string | null = null) => {
    if (!user) return;
    setLoading(true);
    try {
      const url = cursorParam ? `/whisper/inbox?cursor=${cursorParam}` : '/whisper/inbox';
      const res = await api.get(url);
      const body = res.data?.data ?? res.data ?? {};
      const msgs: WhisperMessage[] = body.messages || [];
      setMessages(prev => (cursorParam ? [...prev, ...msgs] : msgs));
      setCursor(body.nextCursor || null);
      setHasMore(!!body.hasMore);
    } catch (err) {
      console.error('Failed to fetch whisper inbox:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const deleteMessage = useCallback(async (id: string) => {
    await api.delete(`/whisper/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const reportMessage = useCallback(async (id: string) => {
    await api.post(`/whisper/${id}/report`);
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/whisper/settings');
      const data = res.data?.data ?? res.data ?? {};
      setSettings({
        enabled: !!data.enabled,
        link_slug: data.link_slug || '',
      });
    } catch (err) {
      console.error('Failed to fetch whisper settings:', err);
      setSettings({ enabled: false, link_slug: '' });
    }
  }, [user]);

  const updateSettings = useCallback(async (enabled: boolean) => {
    const res = await api.patch('/whisper/settings', { enabled });
    const data = res.data?.data ?? res.data ?? {};
    setSettings(prev => ({ ...prev, enabled: !!data.enabled }));
    return res.data;
  }, []);

  const regenerateSlug = useCallback(async () => {
    const res = await api.post('/whisper/settings/regenerate-slug');
    const data = res.data?.data ?? res.data ?? {};
    const linkSlug: string | undefined = data.link_slug;
    if (linkSlug) setSettings(prev => ({ ...prev, link_slug: linkSlug }));
    return linkSlug;
  }, []);

  const value: WhisperContextValue = {
    messages,
    cursor,
    hasMore,
    loading,
    settings,
    fetchInbox,
    deleteMessage,
    reportMessage,
    fetchSettings,
    updateSettings,
    regenerateSlug,
  };

  return <WhisperContext.Provider value={value}>{children}</WhisperContext.Provider>;
}

export function useWhisper() {
  const ctx = useContext(WhisperContext);
  if (!ctx) throw new Error('useWhisper must be used within a WhisperProvider');
  return ctx;
}