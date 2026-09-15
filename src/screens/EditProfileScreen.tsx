import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

type FieldKey =
  | 'avatar'
  | 'cover'
  | 'name'
  | 'username'
  | 'bio'
  | 'email'
  | 'phone'
  | 'location'
  | 'website';

interface ProfileData {
  id: string;
  name: string;
  username: string;
  email: string;
  bio?: string;
  avatar?: string | null;
  coverImage?: string | null;
  phone?: string;
  location?: string;
  website?: string;
}

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not logged in');
      const response = await api.get(`/users/${user.id}/profile`);
      const data = response.data;
      const p = data.data || data;
      return {
        id: String(p.id || user.id),
        name: p.name || user.name || '',
        username: p.username || user.username || '',
        email: p.email || user.email || '',
        bio: p.bio || '',
        avatar: resolveMediaUrl(p.avatar || (user as any).avatar || null),
        coverImage: resolveMediaUrl(p.coverImage || null),
        phone: p.phone || '',
        location: p.location || '',
        website: p.website || '',
      } as ProfileData;
    },
    enabled: !!user,
  });

  const goToField = (field: FieldKey, currentValue: string) => {
    (navigation.navigate as any)('EditProfileField', {
      field,
      currentValue,
    });
  };

  const renderRow = (
    field: FieldKey,
    icon: keyof typeof Feather.glyphMap,
    label: string,
    value: string,
    options: { multiline?: boolean } = {}
  ) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={() => goToField(field, value)}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: isDark ? '#374151' : '#f0f4ff' }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text
          style={[styles.rowValue, { color: colors.text }]}
          numberOfLines={options.multiline ? 2 : 1}
        >
          {value && value.length > 0 ? value : 'Not set'}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Cover ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => goToField('cover', profile.coverImage || '')}
          style={styles.coverSection}
        >
          {profile.coverImage ? (
            <Image
              source={{ uri: profile.coverImage }}
              style={styles.coverImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
              <Feather name="image" size={28} color={colors.textMuted} />
              <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                Tap to add cover photo
              </Text>
            </View>
          )}
          <View style={styles.coverEditBadge}>
            <Feather name="camera" size={16} color="white" />
          </View>
        </TouchableOpacity>

        {/* ── Avatar ── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={() => goToField('avatar', profile.avatar || '')}
            activeOpacity={0.8}
            style={styles.avatarContainer}
          >
            <Avatar source={profile.avatar} size={88} fallback={profile.name || 'U'} />
            <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
              <Feather name="camera" size={16} color="white" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Fields ── */}
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          {renderRow('name', 'user', 'Name', profile.name)}
          {renderRow('username', 'at-sign', 'Username', profile.username ? `@${profile.username}` : '')}
          {renderRow('bio', 'align-left', 'Bio', profile.bio || '', { multiline: true })}
        </View>

        <View style={[styles.section, { borderTopColor: colors.border }]}>
          {renderRow('email', 'mail', 'Email', profile.email)}
          {renderRow('phone', 'phone', 'Phone', profile.phone || '')}
          {renderRow('location', 'map-pin', 'Location', profile.location || '')}
          {renderRow('website', 'link', 'Website', profile.website || '')}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { paddingBottom: 40 },

  // Cover
  coverSection: {
    height: 150,
    position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlaceholderText: { marginTop: 8, fontSize: 13 },
  coverEditBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    marginTop: -44,
    marginBottom: 12,
  },
  avatarContainer: { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },

  // Rows
  section: { borderTopWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { fontSize: 15, marginTop: 3 },
});