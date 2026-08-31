import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import api from '../api/client';
import { resolveMediaUrl } from '../lib/media';

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
  const { user, updateUser } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  // ── Form state ──
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Fetch current profile ──
  const {
    data: profile,
    isLoading: profileLoading,
  } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not logged in');
      const response = await api.get(`/users/${user.id}/profile`);
      const data = response.data;
      const profileData = data.data || data;
      return {
        id: String(profileData.id || user.id),
        name: profileData.name || user.name || '',
        username: profileData.username || user.username || '',
        email: profileData.email || user.email || '',
        bio: profileData.bio || '',
        avatar: resolveMediaUrl(profileData.avatar || user.avatar || null),
        coverImage: resolveMediaUrl(profileData.coverImage || null),
        phone: profileData.phone || '',
        location: profileData.location || '',
        website: profileData.website || '',
      } as ProfileData;
    },
    enabled: !!user,
  });

  // ── Populate form when profile loads ──
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setLocation(profile.location || '');
      setWebsite(profile.website || '');
    }
  }, [profile]);

  // ── Update profile mutation ──
  const updateProfileMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await api.put(`/users/${user?.id}`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data) {
        updateUser(data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      Alert.alert('Success', 'Profile updated successfully!');
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update profile.');
    },
  });

  // ── Pick avatar ──
  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery access to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  // ── Pick cover image ──
  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery access to change your cover image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
    }
  };

  // ── Remove avatar ──
  const removeAvatar = () => {
    setAvatarUri(null);
  };

  // ── Remove cover ──
  const removeCover = () => {
    setCoverUri(null);
  };

  // ── Submit form ──
  const handleSubmit = () => {
    // Validation
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required.');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Error', 'Username is required.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Email is required.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    const formData = new FormData();

    formData.append('name', name.trim());
    formData.append('username', username.trim());
    formData.append('bio', bio.trim());
    formData.append('email', email.trim());
    formData.append('phone', phone.trim());
    formData.append('location', location.trim());
    formData.append('website', website.trim());

    if (avatarUri) {
      const filename = avatarUri.split('/').pop() || 'avatar.jpg';
      const fileType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
      formData.append('avatar', {
        uri: avatarUri,
        name: filename,
        type: fileType,
      } as any);
    }

    if (coverUri) {
      const filename = coverUri.split('/').pop() || 'cover.jpg';
      const fileType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
      formData.append('coverImage', {
        uri: coverUri,
        name: filename,
        type: fileType,
      } as any);
    }

    updateProfileMutation.mutate(formData);
  };

  // ── Loading state ──
  if (profileLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        {/* ─── Header ─── */}
        <View style={[styles.header, { 
          backgroundColor: colors.surface, 
          borderBottomColor: colors.border 
        }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={updateProfileMutation.isPending}>
            <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Profile</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={updateProfileMutation.isPending}
            style={[styles.saveButton, { backgroundColor: colors.primary }, updateProfileMutation.isPending && styles.saveButtonDisabled]}
          >
            {updateProfileMutation.isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ─── Cover Image ─── */}
          <View style={styles.coverSection}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />
            ) : profile?.coverImage ? (
              <Image source={{ uri: profile.coverImage }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
                <Feather name="image" size={32} color={colors.textMuted} />
                <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>Add cover photo</Text>
              </View>
            )}
            <View style={styles.coverActions}>
              <TouchableOpacity style={[styles.coverButton, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={pickCover}>
                <Feather name="camera" size={18} color="white" />
              </TouchableOpacity>
              {(coverUri || profile?.coverImage) && (
                <TouchableOpacity style={[styles.coverButton, styles.coverRemoveButton]} onPress={removeCover}>
                  <Feather name="x" size={18} color="white" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ─── Avatar ─── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              <Avatar
                source={avatarUri || profile?.avatar}
                size={80}
                fallback={name || 'U'}
              />
              <TouchableOpacity style={[styles.avatarEditButton, { backgroundColor: colors.primary }]} onPress={pickAvatar}>
                <Feather name="camera" size={16} color="white" />
              </TouchableOpacity>
              {(avatarUri || profile?.avatar) && (
                <TouchableOpacity style={[styles.avatarEditButton, styles.avatarRemoveButton]} onPress={removeAvatar}>
                  <Feather name="x" size={14} color="white" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ─── Form Fields ─── */}
          <View style={styles.form}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Name</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor={colors.placeholder}
                editable={!updateProfileMutation.isPending}
              />
            </View>

            {/* Username */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Username</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                editable={!updateProfileMutation.isPending}
              />
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Letters, numbers, and underscores only.</Text>
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!updateProfileMutation.isPending}
              />
            </View>

            {/* Bio */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell people about yourself..."
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
                maxLength={160}
                editable={!updateProfileMutation.isPending}
              />
              <Text style={[styles.charCount, { color: colors.textMuted }]}>{bio.length}/160</Text>
            </View>

            {/* Phone */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 234 567 8900"
                placeholderTextColor={colors.placeholder}
                keyboardType="phone-pad"
                editable={!updateProfileMutation.isPending}
              />
            </View>

            {/* Location */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Location</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={location}
                onChangeText={setLocation}
                placeholder="City, Country"
                placeholderTextColor={colors.placeholder}
                editable={!updateProfileMutation.isPending}
              />
            </View>

            {/* Website */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.text }]}>Website</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: colors.input, 
                  borderColor: colors.inputBorder,
                  color: colors.text 
                }]}
                value={website}
                onChangeText={setWebsite}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                editable={!updateProfileMutation.isPending}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cancelButton: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  coverSection: {
    position: 'relative',
    height: 150,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPlaceholderText: {
    marginTop: 8,
  },
  coverActions: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  coverButton: {
    padding: 8,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverRemoveButton: {
    backgroundColor: 'rgba(239,68,68,0.8)',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: -40,
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarEditButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    padding: 4,
    borderRadius: 16,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  avatarRemoveButton: {
    backgroundColor: '#ef4444',
    bottom: 32,
    right: 0,
    width: 22,
    height: 22,
  },
  form: {
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
});