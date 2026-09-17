import React, { useEffect } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBar } from '../contexts/TabBarContext';
import { TAB_BAR_CONTENT_HEIGHT } from '../constants/layout';

/**
 * Wraps the default BottomTabBar in an animated container so it can slide
 * off-screen on scroll and back in when the user scrolls up.
 */
export default function AnimatedTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { translateY, show, setTabBarHeight } = useTabBar();
  const bottomInset = Math.max(insets.bottom, 0);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  // Let the provider know how far to translate when hiding
  useEffect(() => {
    setTabBarHeight(tabBarHeight);
  }, [tabBarHeight, setTabBarHeight]);

  // Always bring the tab bar back when the user switches tabs
  useEffect(() => {
    show();
  }, [props.state.index, show]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, { transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}