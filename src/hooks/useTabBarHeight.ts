import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CONTENT_HEIGHT, BOTTOM_SPACING } from '../constants/layout';

/**
 * Single source of truth for how much space the floating tab bar takes
 * up at the bottom of the screen, including the device's safe-area
 * inset (iOS home indicator, Android gesture bar or 3-button nav bar).
 *
 * The tab bar itself is rendered with `position: 'absolute'` (see
 * AppNavigator's MainTabs), so React Navigation does NOT automatically
 * reserve space for it — every screen that sits under it must add its
 * own bottom padding. Using this hook everywhere guarantees that
 * padding always matches the tab bar's actual rendered height, on
 * every device, on both platforms.
 *
 * - `tabBarHeight`         — exact height of the tab bar (mirrors the
 *                             value used in AppNavigator's tabBarStyle)
 * - `contentBottomPadding` — for ScrollView / FlatList
 *                             contentContainerStyle paddingBottom
 * - `fabBottomOffset`      — for positioning a floating action button
 *                             just above the tab bar
 */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  return {
    bottomInset,
    tabBarHeight,
    contentBottomPadding: tabBarHeight + BOTTOM_SPACING,
    fabBottomOffset: tabBarHeight + BOTTOM_SPACING,
  };
}