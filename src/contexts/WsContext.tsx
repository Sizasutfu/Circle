import React, { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import * as SecureStore from 'expo-secure-store';

interface WsContextType {
  isAlive: () => boolean;
  sendMessage: (payload: any) => boolean;
  joinConversation: (convId: string) => void;
  leaveConversation: (convId: string) => void;
  sendTyping: (convId: string, isTyping: boolean) => void;
  registerHandler: (type: string, handler: (data: any) => void) => () => void;
}

const WsContext = createContext<WsContextType | undefined>(undefined);

function getWsUrl(): string {
  const base = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
  // Remove /api if present and convert http to ws
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
  const isConnectedRef = useRef(false);

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

  // ── Conversation management (for DMs) ──
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
      // Get token from SecureStore
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
        // Start ping
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
        if (e.code === 4001) return; // auth failure – don't retry
        if (!user?.id) return; // logged out
        // Reconnect with exponential backoff
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

  const isAlive = useCallback(() => isConnectedRef.current, []);

  const value: WsContextType = {
    isAlive,
    sendMessage,
    joinConversation,
    leaveConversation,
    sendTyping,
    registerHandler,
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