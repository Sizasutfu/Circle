import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';

interface VerificationBadgeProps {
  size?: number;
  color?: string;
  style?: any;
}

export default function VerificationBadge({
  size = 14,
  color = '#3b82f6', // text-blue-500
  style,
}: VerificationBadgeProps) {
  return (
    <MaterialIcons
      name="verified"
      size={size}
      color={color}
      style={style}
      accessibilityLabel="Verified account"
    />
  );
}