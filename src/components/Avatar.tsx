import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

// ── Safe string helper (to avoid "Text strings" errors) ──
function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

interface AvatarProps {
  source?: string | null;
  size?: number;
  fallback?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ source, size = 48, fallback }) => {
  const fallbackText = safeString(fallback || '');
  const firstLetter = fallbackText.charAt(0).toUpperCase() || '?';

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallbackContainer,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.fallbackText, { fontSize: size * 0.4 }]}>
            {firstLetter}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#e5e7eb',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallbackContainer: {
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: 'white',
    fontWeight: 'bold',
  },
});