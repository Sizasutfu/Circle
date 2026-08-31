import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

// ── Theme Types ──
export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  colors: ThemeColors;
}

// ── Theme Colors ──
export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  tabBar: string;
  header: string;
  input: string;
  inputBorder: string;
  placeholder: string;
  shadow: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: '#f9fafb',
  surface: '#ffffff',
  card: '#ffffff',
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  primary: '#6C63FF',
  primaryLight: '#8B83FF',
  primaryDark: '#5A52D5',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  tabBar: '#ffffff',
  header: '#ffffff',
  input: '#f9fafb',
  inputBorder: '#e5e7eb',
  placeholder: '#9ca3af',
  shadow: 'rgba(0,0,0,0.1)',
  overlay: 'rgba(0,0,0,0.5)',
};

export const darkColors: ThemeColors = {
  background: '#111827',
  surface: '#1f2937',
  card: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  border: '#374151',
  primary: '#8B83FF',
  primaryLight: '#A59BFF',
  primaryDark: '#6C63FF',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  tabBar: '#1f2937',
  header: '#1f2937',
  input: '#374151',
  inputBorder: '#4b5563',
  placeholder: '#6b7280',
  shadow: 'rgba(0,0,0,0.3)',
  overlay: 'rgba(0,0,0,0.7)',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [isLoading, setIsLoading] = useState(true);

  // ── Load saved theme preference ──
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('@theme_preference');
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeState(savedTheme);
        } else {
          // Use system preference if no saved preference
          setThemeState(systemColorScheme === 'dark' ? 'dark' : 'light');
        }
      } catch (error) {
        console.warn('Failed to load theme:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, [systemColorScheme]);

  // ── Save theme preference ──
  const setTheme = async (newTheme: ThemeMode) => {
    try {
      await AsyncStorage.setItem('@theme_preference', newTheme);
      setThemeState(newTheme);
    } catch (error) {
      console.warn('Failed to save theme:', error);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const colors = theme === 'light' ? lightColors : darkColors;
  const isDark = theme === 'dark';

  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        toggleTheme,
        setTheme,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};