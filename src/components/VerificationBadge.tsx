import React from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface VerificationBadgeProps {
  size?: number;
  color?: string;
  style?: any;
}

/**
 * Circular verification badge — matches the web app's SVG design
 * (filled circle with white checkmark) using only RN primitives +
 * Feather (already installed). No native modules required.
 */
export default function VerificationBadge({
  size = 14,
  color = '#3b82f6',
  style,
}: VerificationBadgeProps) {
  // Feather's "check" glyph sits slightly high — nudge it down a hair
  // so it's visually centered inside the circle.
  const iconSize = Math.round(size * 0.7);

  return (
    <View
      accessibilityLabel="Verified account"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Feather
        name="check"
        size={iconSize}
        color="#ffffff"
        style={{ marginTop: 1 }}
      />
    </View>
  );
}