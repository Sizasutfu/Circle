import React, { createContext, useContext, useRef, useCallback } from 'react';
import { Animated } from 'react-native';

interface TabBarContextValue {
  translateY: Animated.Value;      // 0 = visible, tabBarHeight = hidden
  hide: () => void;
  show: () => void;
  setTabBarHeight: (h: number) => void;
}

const TabBarContext = createContext<TabBarContextValue | null>(null);

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const tabBarHeightRef = useRef(0);
  const hiddenRef = useRef(false);

  const setTabBarHeight = useCallback((h: number) => {
    tabBarHeightRef.current = h;
  }, []);

  const hide = useCallback(() => {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    Animated.timing(translateY, {
      toValue: tabBarHeightRef.current || 100,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const show = useCallback(() => {
    if (!hiddenRef.current) return;
    hiddenRef.current = false;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  return (
    <TabBarContext.Provider value={{ translateY, hide, show, setTabBarHeight }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const ctx = useContext(TabBarContext);
  if (!ctx) throw new Error('useTabBar must be used within TabBarProvider');
  return ctx;
}