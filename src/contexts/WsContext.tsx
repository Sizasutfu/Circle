import React, { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

interface WsContextType {
  isAlive: () => boolean;
  sendMessage: (payload: any) => boolean;
  joinConversation: (convId: string) => void;
  leaveConversation: (convId: string) => void;
  sendTyping: (convId: string, isTyping: boolean) => void;
  registerHandler: (type: string, handler: (data: any) => void) => () => void;
  // ── New online status methods ──
  isUserOnline: (userId: string) => boolean;
  onlineUsers: Set<string>;
}

const WsContext = createContext<WsContextType | undefined>(undefined);

function getWsUrl(): string {
  const base = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
  const cleanBase = base.replace(/\/api$/, '').replace(/^http/, 'ws');
  return `${cleanBase}/ws`;
}

export const WsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectMsRef = useRef(1500);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnectedRef = useRef(false);

  // ── Online users state ──
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // ── Register / unregister handlers ──
  const registerHandler = useCallback((type: string, handler: (data: any) => void) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)?.add(handler);
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  // ── Send message ──
  const sendMessage = useCallback((payload: any): boolean => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  // ── Conversation management ──
  const joinConversation = useCallback((convId: string) => {
    sendMessage({ type: 'join_conversation', conversationId: convId });
  }, [sendMessage]);

  const leaveConversation = useCallback((convId: string) => {
    sendMessage({ type: 'leave_conversation', conversationId: convId });
  }, [sendMessage]);

  const sendTyping = useCallback((convId: string, isTyping: boolean) => {
    sendMessage({ type: 'typing', conversationId: convId, isTyping });
  }, [sendMessage]);

  // ── Connect / disconnect ──
  const connect = useCallback(async () => {
    if (!user?.id) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (!token) {
        console.warn('[WS] No auth token found');
        return;
      }

      const wsUrl = `${getWsUrl()}?token=${token}&userId=${user.id}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        isConnectedRef.current = true;
        reconnectMsRef.current = 1500;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          sendMessage({ type: 'ping' });
        }, 25000);
      };

      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        const handlers = handlersRef.current.get(msg.type);
        if (handlers) {
          handlers.forEach((handler) => handler(msg));
        }
      };

      ws.onclose = (e) => {
        console.log('[WS] Disconnected:', e.code);
        isConnectedRef.current = false;
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (e.code === 4001) return;
        if (!user?.id) return;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
          reconnectMsRef.current = Math.min(reconnectMsRef.current * 2, 30000);
        }, reconnectMsRef.current);
      };

      ws.onerror = (error) => {
        console.warn('[WS] Error:', error);
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
    }
  }, [user, sendMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    isConnectedRef.current = false;
    // Clear online users on disconnect
    setOnlineUsers(new Set());
  }, []);

  // ── Auto‑connect/disconnect on auth change ──
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [user, connect, disconnect]);

  // ── Heartbeat: tell the backend "I'm online" ──
  // This is a plain REST call (POST /dm/heartbeat), not a WS message —
  // it runs as long as the user is logged in, independent of whether the
  // WebSocket itself is currently connected (matching the web app's
  // DmContext, which does the same). Without this, the backend's
  // isOnline() check for this user's presence never sees a recent
  // heartbeat, so other users always see this user as offline —
  // regardless of whether getPresence/isUserOnline works correctly on
  // their end.
  useEffect(() => {
    if (!user?.id) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    const sendHeartbeat = () => {
      api.post('/dm/heartbeat').catch(() => {
        // Silent fail — a missed heartbeat just means this user briefly
        // shows as offline to others; not worth surfacing to the UI.
      });
    };

    sendHeartbeat();
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [user?.id]);

  // ── Register online/offline event handlers ──
  // Kept as-is: if the backend ever does start broadcasting these over
  // the WS connection, this will pick them up for free. In the meantime,
  // ChatDetailScreen polls GET /dm/conversations/:id/presence directly
  // rather than relying on isUserOnline/onlineUsers below, since nothing
  // in this app's WS server currently emits user_online/user_offline/
  // presence messages.
  useEffect(() => {
    const unregOnline = registerHandler('user_online', (data: any) => {
      const userId = data.userId || data.user_id || data.id;
      if (userId) {
        setOnlineUsers((prev) => new Set(prev).add(String(userId)));
      }
    });

    const unregOffline = registerHandler('user_offline', (data: any) => {
      const userId = data.userId || data.user_id || data.id;
      if (userId) {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(String(userId));
          return next;
        });
      }
    });

    // Also listen for initial presence list (if sent)
    const unregPresence = registerHandler('presence', (data: any) => {
      if (data.onlineUsers && Array.isArray(data.onlineUsers)) {
        setOnlineUsers(new Set(data.onlineUsers.map(String)));
      }
    });

    return () => {
      unregOnline();
      unregOffline();
      unregPresence();
    };
  }, [registerHandler]);

  const isAlive = useCallback(() => isConnectedRef.current, []);

  const isUserOnline = useCallback((userId: string) => {
    if (!userId) return false;
    return onlineUsers.has(String(userId));
  }, [onlineUsers]);

  const value: WsContextType = {
    isAlive,
    sendMessage,
    joinConversation,
    leaveConversation,
    sendTyping,
    registerHandler,
    isUserOnline,
    onlineUsers,
  };

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
};

export const useWs = (): WsContextType => {
  const context = useContext(WsContext);
  if (!context) {
    throw new Error('useWs must be used within a WsProvider');
  }
  return context;
};