import { useCallback, useRef } from 'react';
import { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTabBar } from '../contexts/TabBarContext';

const DELTA_THRESHOLD = 8;
const TOP_ZONE = 20;

/**
 * Returns an onScroll handler that hides the tab bar when the user scrolls
 * down and shows it when they scroll up or reach the top of the list.
 */
export function useTabBarHideOnScroll() {
  const { hide, show } = useTabBar();
  const lastY = useRef(0);

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;

      if (y <= TOP_ZONE) {
        show();
      } else if (delta > DELTA_THRESHOLD) {
        hide();
      } else if (delta < -DELTA_THRESHOLD) {
        show();
      }

      lastY.current = y;
    },
    [hide, show]
  );
}