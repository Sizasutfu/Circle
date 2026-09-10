import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

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
    // Use SecureStore on native
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

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 15000,
});

// ── Request interceptor: attach token ──
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getItem('auth_token');
      console.log('🔑 Token present:', token ? 'Yes' : 'No');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      console.log('📤 Request:', config.method?.toUpperCase(), config.url);
      return config;
    } catch (error) {
      console.warn('Error getting token:', error);
      return config;
    }
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// ── Response interceptor: handle 401 ──
api.interceptors.response.use(
  (response) => {
    console.log('📥 Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.config?.url);
      
      if (error.response.status === 401) {
        console.warn('🔒 401 Unauthorized - Clearing token');
        await storage.deleteItem('auth_token');
        await storage.deleteItem('user_data');
        // You can dispatch a logout event here if needed
      }
    } else {
      console.error('❌ Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;