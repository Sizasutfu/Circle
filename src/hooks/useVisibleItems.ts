import { useRef, useState } from 'react';
import type { ViewToken } from 'react-native';

/**
 * Track which items in a FlatList/ScrollView are actually visible on screen.
 *
 * Returns a Set of stringified item ids, plus the `viewabilityConfig` and
 * `onViewableItemsChanged` you need to hand to the list. Both of those must
 * be referentially stable for React Native's viewability system to work — the
 * hook handles that with useRef.
 *
 * Usage:
 *   const { visibleIds, viewabilityConfig, onViewableItemsChanged } = useVisibleItems();
 *   <FlatList
 *     viewabilityConfig={viewabilityConfig}
 *     onViewableItemsChanged={onViewableItemsChanged}
 *     renderItem={({ item }) => (
 *       <PostCard post={item} isVisible={visibleIds.has(String(item.id))} />
 *     )}
 *   />
 */
export function useVisibleItems() {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  const viewabilityConfig = useRef({
    // Item is considered visible when ≥50% of it is on screen.
    itemVisiblePercentThreshold: 50,
    // Ignore micro-scroll jitter.
    minimumViewTime: 150,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = new Set<string>();
      for (const v of viewableItems) {
        if (v.isViewable && v.item?.id != null) {
          next.add(String(v.item.id));
        }
      }
      setVisibleIds(next);
    }
  ).current;

  return { visibleIds, viewabilityConfig, onViewableItemsChanged };
}