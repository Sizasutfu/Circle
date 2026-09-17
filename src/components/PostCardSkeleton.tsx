// src/components/PostCardSkeleton.tsx
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostCardSkeletonProps {
  /** Show a media block below the text lines (image/video placeholder). */
  withMedia?: boolean;
  /** Media aspect ratio — 1 for square (image), 0.5625 for 16:9 (video). */
  mediaAspect?: number;
}

/**
 * A shimmering skeleton that mirrors PostCard's layout: avatar + name row,
 * two or three text lines, optional media block, and an engagement row.
 */
export default function PostCardSkeleton({
  withMedia = true,
  mediaAspect = 1,
}: PostCardSkeletonProps) {
  const { colors, isDark } = useTheme();

  // Single animated value drives every bar so the whole card pulses in sync
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.7,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const barColor = isDark ? '#374151' : '#e5e7eb';
  const lighterBar = isDark ? '#2b3444' : '#eef0f3';

  const bar = (style: any, color: string = barColor) => (
    <Animated.View
      style={[
        { backgroundColor: color, borderRadius: 4, opacity: pulse },
        style,
      ]}
    />
  );

  const mediaHeight = (SCREEN_WIDTH - 32) * mediaAspect;

  return (
    <View style={styles.card}>
      {/* Header: avatar + name/username */}
      <View style={styles.cardInner}>
        <View style={styles.avatarTouch}>
          <Animated.View
            style={[
              styles.avatar,
              { backgroundColor: barColor, opacity: pulse },
            ]}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            {/* Name bar */}
            {bar({ width: 110, height: 12, marginBottom: 6 })}
            {/* Meta row: @handle + time */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {bar({ width: 70, height: 10 }, lighterBar)}
              {bar({ width: 40, height: 10 }, lighterBar)}
            </View>
          </View>

          {/* Text lines */}
          <View style={{ marginTop: 10, gap: 6 }}>
            {bar({ width: '100%', height: 12 })}
            {bar({ width: '92%', height: 12 })}
            {bar({ width: '60%', height: 12 })}
          </View>
        </View>
      </View>

      {/* Optional media block */}
      {withMedia && (
        <Animated.View
          style={[
            styles.media,
            {
              height: mediaHeight,
              backgroundColor: barColor,
              opacity: pulse,
            },
          ]}
        />
      )}

      {/* Engagement row */}
      <View style={styles.cardInner}>
        <View style={styles.avatarTouch} />
        <View style={styles.content}>
          <View style={styles.engagementBar}>
            {[42, 42, 42, 42, 24].map((w, i) => (
              <View key={i} style={styles.engagementButton}>
                {bar({ width: 20, height: 20, borderRadius: 10 })}
                {i < 4 && bar({ width: w, height: 11, marginLeft: 6 })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Convenience: renders N skeletons with alternating media styles. */
export function PostCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton
          key={i}
          withMedia={i % 2 === 0}
          mediaAspect={i % 2 === 0 ? 1 : 0.5625}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  avatarTouch: { width: 40, marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  content: { flex: 1 },
  headerRow: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  media: {
    width: '100%',
    marginTop: 12,
  },
  engagementBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  engagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});