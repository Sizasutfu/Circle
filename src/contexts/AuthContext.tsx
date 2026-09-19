import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

// ── Storage helper that works on both native and web ──
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        return;
      }
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      return;
    }
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
        return;
      } catch {
        return;
      }
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      return;
    }
  },
};

// ============================================================
//  FLAG NORMALIZERS
//  Preserve the "unknown" case (field not sent) as `undefined`.
//  Coercing with `!!` turns absent into "explicitly false", which
//  makes the verification gate fire for verified users whose API
//  returns the flag under a different name or omits it entirely.
// ============================================================
function readBooleanFlag(raw: any, keys: string[]): boolean | undefined {
  if (!raw) return undefined;
  for (const key of keys) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') return v;
    if (v === 1 || v === '1' || v === 'true') return true;
    if (v === 0 || v === '0' || v === 'false') return false;
    // Any other non-null value (a date string, a count, etc.) — treat as truthy
    return !!v;
  }
  return undefined;
}

function normalizeEmailVerified(raw: any): boolean | undefined {
  // A non-null "verified at" timestamp is a positive signal on its own
  const ts =
    raw?.emailVerifiedAt ??
    raw?.email_verified_at ??
    raw?.email_confirmed_at;
  if (ts) return true;

  return readBooleanFlag(raw, [
    'emailVerified',
    'email_verified',
    'isEmailVerified',
    'is_email_verified',
    'verifiedEmail',
    'verified_email',
  ]);
}

function normalizePhoneVerified(raw: any): boolean | undefined {
  const ts = raw?.phoneVerifiedAt ?? raw?.phone_verified_at;
  if (ts) return true;

  return readBooleanFlag(raw, [
    'phoneVerified',
    'phone_verified',
    'isPhoneVerified',
    'is_phone_verified',
  ]);
}

// ============================================================
//  TYPES
// ============================================================
interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  username: string;
  avatar?: string;
  verified?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  // ── Phone Auth ──
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<User>;
  registerPhoneSendOtp: (phone: string, name: string) => Promise<void>;
  registerPhoneVerifyOtp: (phone: string, code: string, name: string) => Promise<User>;
  // ── Email Verification ──
  sendEmailVerification: (email: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<User>;
  // ── Password Reset ──
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, password: string) => Promise<void>;
}

interface RegisterData {
  name: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
}

// ============================================================
//  CONTEXT
// ============================================================
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Load user from storage on app start ──
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await storage.getItem('auth_token');
        const userData = await storage.getItem('user_data');
        if (token && userData) {
          setUser(JSON.parse(userData));
          console.log('✅ User loaded from storage');
        }
      } catch (error) {
        console.warn('Failed to load user:', error);
        await storage.deleteItem('auth_token');
        await storage.deleteItem('user_data');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // ── Set user and persist both token and user ──
  const setCurrentUser = useCallback(async (userData: User | null, token?: string) => {
    if (token) {
      await storage.setItem('auth_token', token);
      console.log('🔑 Token saved to storage');
    } else if (!userData) {
      await storage.deleteItem('auth_token');
    }
    if (userData) {
      await storage.setItem('user_data', JSON.stringify(userData));
      setUser(userData);
      console.log('👤 User saved to storage:', userData.username || userData.name);
    } else {
      await storage.deleteItem('user_data');
      setUser(null);
    }
  }, []);

  // ============================================================
  //  EMAIL/PASSWORD AUTH
  // ============================================================

  // ── Login ──
  const login = useCallback(async (email: string, password: string): Promise<User> => {
    console.log('🔐 Login attempt for:', email);

    const response = await api.post('/users/login', { email, password });
    console.log('📦 Login response:', JSON.stringify(response.data, null, 2));

    // Backend returns: { success: true, data: { id, name, email, username, token, ... } }
    const userData = response.data.data;

    if (!userData) {
      throw new Error('Invalid response from server');
    }

    const { token, ...userWithoutToken } = userData;

    // emailVerified / phoneVerified stay `undefined` when the API
    // doesn't send them — the verification gate in AppNavigator uses
    // `=== false` and ignores "unknown", so verified users aren't
    // dropped onto the VerifyEmail screen by accident.
    const nextUser: User = {
      id: String(userWithoutToken.id || ''),
      name: userWithoutToken.name || 'Anonymous',
      email: userWithoutToken.email || '',
      username: userWithoutToken.username || userWithoutToken.email?.split('@')[0] || 'user',
      avatar: userWithoutToken.avatar || userWithoutToken.picture || null,
      verified: !!userWithoutToken.verified,
      emailVerified: normalizeEmailVerified(userWithoutToken),
      phoneVerified: normalizePhoneVerified(userWithoutToken),
    };

    await setCurrentUser(nextUser, token);
    console.log('✅ Login successful for:', nextUser.username);
    return nextUser;
  }, [setCurrentUser]);

  // ── Register ──
  const register = useCallback(async (data: RegisterData): Promise<User> => {
    console.log('📝 Register attempt:', data.email);

    const response = await api.post('/users/register', data);
    console.log('📦 Register response:', JSON.stringify(response.data, null, 2));

    const userData = response.data.data;
    if (!userData) {
      throw new Error('Invalid response from server');
    }

    const { token, ...userWithoutToken } = userData;

    const nextUser: User = {
      id: String(userWithoutToken.id || ''),
      name: userWithoutToken.name || 'Anonymous',
      email: userWithoutToken.email || '',
      username: userWithoutToken.username || userWithoutToken.email?.split('@')[0] || 'user',
      avatar: userWithoutToken.avatar || userWithoutToken.picture || null,
      verified: !!userWithoutToken.verified,
      emailVerified: normalizeEmailVerified(userWithoutToken),
      phoneVerified: normalizePhoneVerified(userWithoutToken),
    };

    await setCurrentUser(nextUser, token);
    console.log('✅ Registration successful for:', nextUser.username);
    return nextUser;
  }, [setCurrentUser]);

  // ============================================================
  //  PHONE OTP AUTH
  // ============================================================

  const sendPhoneOtp = useCallback(async (phone: string): Promise<void> => {
    await api.post('/auth/phone/send-otp', { phone });
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, code: string): Promise<User> => {
    const response = await api.post('/auth/phone/verify-otp', { phone, code });
    const { token, data } = response.data;

    // Normalize the payload the same way as login/register, so the
    // verification flags survive the same way regardless of entry point.
    const nextUser: User = {
      id: String(data.id || ''),
      name: data.name || 'Anonymous',
      email: data.email || '',
      username: data.username || data.email?.split('@')[0] || 'user',
      avatar: data.avatar || data.picture || null,
      verified: !!data.verified,
      emailVerified: normalizeEmailVerified(data),
      phoneVerified: normalizePhoneVerified(data),
    };

    await setCurrentUser(nextUser, token);
    return nextUser;
  }, [setCurrentUser]);

  const registerPhoneSendOtp = useCallback(async (phone: string, name: string): Promise<void> => {
    await api.post('/auth/phone/register/send-otp', { phone, name });
  }, []);

  const registerPhoneVerifyOtp = useCallback(async (phone: string, code: string, name: string): Promise<User> => {
    const response = await api.post('/auth/phone/register/verify-otp', { phone, code, name });
    const { token, data } = response.data;

    const nextUser: User = {
      id: String(data.id || ''),
      name: data.name || 'Anonymous',
      email: data.email || '',
      username: data.username || data.email?.split('@')[0] || 'user',
      avatar: data.avatar || data.picture || null,
      verified: !!data.verified,
      emailVerified: normalizeEmailVerified(data),
      phoneVerified: normalizePhoneVerified(data),
    };

    await setCurrentUser(nextUser, token);
    return nextUser;
  }, [setCurrentUser]);

  // ============================================================
  //  EMAIL VERIFICATION
  // ============================================================

  const sendEmailVerification = useCallback(async (email: string): Promise<void> => {
    await api.post('/users/email/send-verification', { email });
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string): Promise<User> => {
    const response = await api.post('/users/email/verify', { email, code });
    const { token, data } = response.data;

    // Prefer the fresh user from the response; fall back to merging
    // the flag onto the current user so the gate always clears.
    const fresh = data?.user ?? data;
    const nextUser: User = fresh && (fresh.id || fresh.email)
      ? {
          id: String(fresh.id || ''),
          name: fresh.name || 'Anonymous',
          email: fresh.email || email,
          username: fresh.username || fresh.email?.split('@')[0] || 'user',
          avatar: fresh.avatar || fresh.picture || null,
          verified: !!fresh.verified,
          emailVerified: true,
          phoneVerified: normalizePhoneVerified(fresh),
        }
      : { ...(user as User), emailVerified: true };

    await setCurrentUser(nextUser, token);
    return nextUser;
  }, [setCurrentUser, user]);

  // ============================================================
  //  PASSWORD RESET
  // ============================================================

  const requestPasswordReset = useCallback(async (email: string): Promise<void> => {
    await api.post('/users/reset-password', { email });
  }, []);

  const confirmPasswordReset = useCallback(async (token: string, password: string): Promise<void> => {
    await api.post('/users/reset-password/confirm', { token, password });
  }, []);

  // ============================================================
  //  LOGOUT
  // ============================================================

  const logout = useCallback(async (): Promise<void> => {
    console.log('🚪 Logging out...');
    await setCurrentUser(null);
    console.log('✅ Logout complete');
  }, [setCurrentUser]);

  // ── Update user ──
  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    storage.setItem('user_data', JSON.stringify(updatedUser));
  }, []);

  // ============================================================
  //  PROVIDER VALUE
  // ============================================================

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateUser,
    sendPhoneOtp,
    verifyPhoneOtp,
    registerPhoneSendOtp,
    registerPhoneVerifyOtp,
    sendEmailVerification,
    verifyEmail,
    requestPasswordReset,
    confirmPasswordReset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================================
//  HOOK
// ============================================================
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};