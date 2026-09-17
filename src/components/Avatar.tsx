// src/components/ui/Avatar.tsx
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

interface AvatarProps {
  source?: string | null;
  size?: number;
  /** @deprecated Ignored — kept so existing call sites keep compiling. */
  fallback?: string;
  backgroundColor?: string;
  borderColor?: string;
  iconColor?: string;
}

/**
 * Avatar — matches the web `AvatarPlaceholder`:
 *   • circular, flex-shrink: 0
 *   • surface background + 1px border
 *   • centered person-silhouette icon at 50% of the container
 *
 * When `source` is provided, the image fills the circle instead.
 */
export const Avatar: React.FC<AvatarProps> = ({
  source,
  size = 48,
  backgroundColor = '#f3f4f6', // var(--color-surface)
  borderColor = '#e5e7eb',     // var(--color-border)
  iconColor = '#9ca3af',       // var(--color-txt3)
}) => {
  const radius = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <Svg
          width={size * 0.5}
          height={size * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          accessibilityLabel="Avatar placeholder"
        >
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
});