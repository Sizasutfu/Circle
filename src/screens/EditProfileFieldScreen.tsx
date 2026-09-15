import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

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

interface RouteParams {
  field: FieldKey;
  currentValue: string;
}

interface FieldConfig {
  label: string;
  placeholder?: string;
  helper?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
  maxLength?: number;
  type: 'text' | 'image';
  aspect?: [number, number];
}

const CONFIG: Record<FieldKey, FieldConfig> = {
  avatar: {
    label: 'Profile Photo',
    type: 'image',
    aspect: [1, 1],
  },
  cover: {
    label: 'Cover Photo',
    type: 'image',
    aspect: [16, 9],
  },
  name: {
    label: 'Name',
    placeholder: 'Your full name',
    type: 'text',
    autoCapitalize: 'words',
  },
  username: {
    label: 'Username',
    placeholder: 'username',
    helper: 'Letters, numbers, and underscores only. 3–25 characters.',
    type: 'text',
    autoCapitalize: 'none',
    maxLength: 25,
  },
  bio: {
    label: 'Bio',
    placeholder: 'Tell people about yourself...',
    type: 'text',
    multiline: true,
    maxLength: 160,
  },
  email: {
    label: 'Email',
    placeholder: 'you@example.com',
    type: 'text',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
  },
  phone: {
    label: 'Phone',
    placeholder: '+1 234 567 8900',
    type: 'text',
    keyboardType: 'phone-pad',
  },
  location: {
    label: 'Location',
    placeholder: 'City, Country',
    type: 'text',
  },
  website: {
    label: 'Website',
    placeholder: 'https://yourwebsite.com',
    type: 'text',
    keyboardType: 'url',
    autoCapitalize: 'none',
  },
};

export default function EditProfileFieldScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { field, currentValue } = route.params as RouteParams;
  const { user, updateUser } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const config = CONFIG[field] || CONFIG.name;

  const [value, setValue] = useState(currentValue || '');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Image picker for avatar/cover ──
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery access to pick an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: config.aspect || [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPendingImage(result.assets[0].uri);
    }
  };

  // ── Validation ──
  const validate = (): string | null => {
    const trimmed = value.trim();

    if (field === 'name' && !trimmed) return 'Name is required.';
    if (field === 'email') {
      if (!trimmed) return 'Email is required.';
      if (!trimmed.includes('@') || !trimmed.includes('.')) return 'Enter a valid email.';
    }
    if (field === 'username') {
      if (!trimmed) return 'Username is required.';
      if (!/^[a-z0-9_]{3,25}$/i.test(trimmed)) {
        return 'Username must be 3–25 characters: letters, numbers, underscores only.';
      }
    }
    if (field === 'website' && trimmed && !/^https?:\/\//i.test(trimmed)) {
      return 'Website must start with http:// or https://';
    }
    return null;
  };

  // ── Save ──
  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert('Error', validationError);
      return;
    }

    if (!user) return;

    // If nothing changed and no new image picked, just go back
    const unchanged = value.trim() === (currentValue || '').trim() && !pendingImage;
    if (unchanged) {
      navigation.goBack();
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();

      // Backend requires name + email on every update — always send current values
      formData.append('name', field === 'name' ? value.trim() : (user.name || ''));
      formData.append('email', field === 'email' ? value.trim() : (user.email || ''));

      // Send only the field being changed
      if (field === 'name' || field === 'email') {
        // already handled above
      } else if (field === 'avatar' && pendingImage) {
        const filename = pendingImage.split('/').pop() || 'avatar.jpg';
        const type = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        formData.append('avatar', { uri: pendingImage, name: filename, type } as any);
      } else if (field === 'cover' && pendingImage) {
        const filename = pendingImage.split('/').pop() || 'cover.jpg';
        const type = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        formData.append('coverImage', { uri: pendingImage, name: filename, type } as any);
      } else if (config.type === 'text') {
        formData.append(field, value.trim());
      }

      const response = await api.put(`/users/${user.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const updated = response.data?.data || response.data;
      if (updated) updateUser(updated);

      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      queryClient.invalidateQueries({ queryKey: ['user-posts'] });

      navigation.goBack();
    } catch (error: any) {
      console.error('Update failed:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to update. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render image field ──
  const renderImageField = () => {
    const displayUri = pendingImage || currentValue || null;
    const isCover = field === 'cover';

    return (
      <View style={styles.imageSection}>
        <TouchableOpacity
          style={[
            styles.imagePreview,
            isCover ? styles.coverPreview : styles.avatarPreview,
            { backgroundColor: isDark ? '#374151' : '#f3f4f6', borderColor: colors.border },
          ]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          {displayUri ? (
            <Image
              source={{ uri: displayUri }}
              style={styles.imagePreviewContent}
              contentFit={isCover ? 'cover' : 'cover'}
            />
          ) : (
            <View style={styles.imageEmpty}>
              <Feather name="camera" size={28} color={colors.textMuted} />
              <Text style={[styles.imageEmptyText, { color: colors.textMuted }]}>
                Tap to select
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.chooseButton, { backgroundColor: colors.primary }]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          <Feather name="image" size={16} color="white" />
          <Text style={styles.chooseButtonText}>
            {displayUri ? 'Change Photo' : 'Choose Photo'}
          </Text>
        </TouchableOpacity>

        {!!displayUri && (
          <TouchableOpacity
            style={[styles.removeButton, { borderColor: '#ef4444' }]}
            onPress={() => {
              setPendingImage(null);
              setValue('');
            }}
            activeOpacity={0.8}
          >
            <Feather name="trash-2" size={16} color="#ef4444" />
            <Text style={styles.removeButtonText}>Remove Photo</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Render text field ──
  const renderTextField = () => (
    <View style={styles.textSection}>
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.input,
            borderColor: colors.inputBorder,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            config.multiline && styles.inputMultiline,
            { color: colors.text },
          ]}
          value={value}
          onChangeText={setValue}
          placeholder={config.placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType={config.keyboardType || 'default'}
          autoCapitalize={config.autoCapitalize || 'sentences'}
          autoCorrect={false}
          multiline={config.multiline}
          maxLength={config.maxLength}
          editable={!isSaving}
          autoFocus
        />
      </View>

      {config.maxLength && (
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {value.length}/{config.maxLength}
        </Text>
      )}

      {config.helper && (
        <Text style={[styles.helper, { color: colors.textMuted }]}>{config.helper}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={isSaving}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{config.label}</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSaving}
            style={[
              styles.saveButton,
              { backgroundColor: colors.primary },
              isSaving && { opacity: 0.6 },
            ]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {config.type === 'image' ? renderImageField() : renderTextField()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  cancelText: { fontSize: 16 },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  saveText: { color: 'white', fontWeight: '600', fontSize: 15 },

  scrollContent: { padding: 20, paddingBottom: 60 },

  // ── Text field ──
  textSection: {},
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    fontSize: 16,
    minHeight: 24,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
  helper: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },

  // ── Image field ──
  imageSection: {
    alignItems: 'center',
    gap: 16,
  },
  imagePreview: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPreview: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  coverPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
  },
  imagePreviewContent: {
    width: '100%',
    height: '100%',
  },
  imageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  imageEmptyText: {
    marginTop: 8,
    fontSize: 13,
  },
  chooseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  chooseButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  removeButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
});