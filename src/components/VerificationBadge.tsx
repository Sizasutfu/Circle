import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface VerificationBadgeProps {
  size?: number;
  color?: string;
  style?: any;
}

/**
 * Verified-account badge — scalloped circle with a white checkmark,
 * rendered as a single SVG path so it scales crisply at any size.
 * Path: Material Design "verified" icon (24x24 viewBox).
 */
export default function VerificationBadge({
  size = 14,
  color = '#3b82f6',
  style,
}: VerificationBadgeProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      accessibilityLabel="Verified account"
    >
      <Path
        fill={color}
        // Scalloped badge body
        d="M23 12l-2.44-2.79.34-3.69-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"
      />
      <Path
        fill="#ffffff"
        // Checkmark cut into the badge
        d="M10.09 16.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"
      />
    </Svg>
  );
}