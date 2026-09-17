import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useLive } from '../contexts/LiveContext';
import { useTheme } from '../contexts/ThemeContext';
import { resolveMediaUrl } from '../lib/media';

export default function LiveFeedStrip() {
  const { colors, isDark } = useTheme();
  const { activeSessions, isLoadingSessions, loadActiveSessions, watchSession } =
    useLive();

  useEffect(() => {
    loadActiveSessions();
    const interval = setInterval(loadActiveSessions, 30000);
    return () => clearInterval(interval);
  }, [loadActiveSessions]);

  if (isLoadingSessions && activeSessions.length === 0) return null;
  if (activeSessions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        data={activeSessions}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.sessionId}
        renderItem={({ item }) => {
          const avatar = resolveMediaUrl(item.broadcasterAvatar);
          return (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
              ]}
              onPress={() => watchSession(item.sessionId)}
              activeOpacity={0.85}
            >
              {/* Preview tile */}
              <View
                style={[
                  styles.preview,
                  { backgroundColor: isDark ? '#111827' : '#e5e7eb' },
                ]}
              >
                {/* LIVE badge */}
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>

                {/* Viewer count */}
                <View style={styles.viewerBadge}>
                  <Feather name="eye" size={11} color="#fff" />
                  <Text style={styles.viewerText}>
                    {item.viewerCount || 0}
                  </Text>
                </View>

                {/* Avatar center */}
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    style={styles.previewAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.previewAvatar, { backgroundColor: '#374151' }]}>
                    <Feather name="user" size={20} color="#9ca3af" />
                  </View>
                )}
              </View>

              {/* Caption */}
              <View style={styles.caption}>
                <Text
                  style={[styles.name, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.broadcasterName || 'Unknown'}
                </Text>
                <Text
                  style={[styles.title, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {item.title || 'Live stream'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  list: { paddingHorizontal: 12, gap: 12 },
  card: {
    width: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
  preview: {
    height: 90,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    zIndex: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewerBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  viewerText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { padding: 8 },
  name: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 10, marginTop: 1 },
});