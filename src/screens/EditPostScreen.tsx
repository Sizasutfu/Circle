import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

// ===== TYPES =====
interface RouteParams {
  postId: string;
}

// ===== COMPONENT =====
export default function EditPostScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { postId } = route.params as RouteParams;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [existingVideo, setExistingVideo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ---- Fetch post data ----
  const {
    data: post,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const response = await api.get(`/posts/${postId}`);
      return response.data;
    },
  });

  // ---- Populate form when post loads ----
  useEffect(() => {
    if (post) {
      setText(post.text || '');
      if (post.image) {
        setExistingImage(post.image);
        setImageUri(null);
      }
      if (post.video) {
        setExistingVideo(post.video);
        setVideoUri(null);
      }
    }
  }, [post]);

  // ---- Pick Image ----
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery access to pick images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setExistingImage(null);
      setVideoUri(null);
      setExistingVideo(null);
    }
  };

  // ---- Pick Video ----
  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery access to pick videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
      setExistingVideo(null);
      setImageUri(null);
      setExistingImage(null);
    }
  };

  // ---- Remove Media ----
  const removeMedia = () => {
    setImageUri(null);
    setVideoUri(null);
    setExistingImage(null);
    setExistingVideo(null);
  };

  // ---- Update post mutation ----
  const updatePostMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.put(`/posts/${postId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to update post. Please try again.'
      );
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  // ---- Submit ----
  const handleSubmit = () => {
    const trimmedText = text.trim();
    const hasMedia = imageUri || videoUri || existingImage || existingVideo;

    if (!trimmedText && !hasMedia) {
      Alert.alert('Empty post', 'Please write something or add a photo/video.');
      return;
    }

    const textChanged = trimmedText !== (post?.text || '');
    const imageChanged =
      imageUri !== null || existingImage !== (post?.image || null);
    const videoChanged =
      videoUri !== null || existingVideo !== (post?.video || null);

    if (!textChanged && !imageChanged && !videoChanged) {
      Alert.alert('No changes', 'You haven\'t made any changes to the post.');
      return;
    }

    Alert.alert(
      'Update Post',
      'Are you sure you want to update this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => {
            setIsSaving(true);
            const formData = new FormData();

            formData.append('text', trimmedText);

            if (imageUri) {
              const filename = imageUri.split('/').pop() || 'photo.jpg';
              const fileType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
              formData.append('image', {
                uri: imageUri,
                name: filename,
                type: fileType,
              } as any);
            } else if (existingImage === null && post?.image) {
              formData.append('removeImage', 'true');
            }

            if (videoUri) {
              const filename = videoUri.split('/').pop() || 'video.mp4';
              formData.append('video', {
                uri: videoUri,
                name: filename,
                type: 'video/mp4',
              } as any);
            } else if (existingVideo === null && post?.video) {
              formData.append('removeVideo', 'true');
            }

            updatePostMutation.mutate(formData);
          },
        },
      ]
    );
  };

  // ---- Cancel ----
  const handleCancel = () => {
    const trimmedText = text.trim();
    const textChanged = trimmedText !== (post?.text || '');
    const imageChanged =
      imageUri !== null || existingImage !== (post?.image || null);
    const videoChanged =
      videoUri !== null || existingVideo !== (post?.video || null);

    if (textChanged || imageChanged || videoChanged) {
      Alert.alert('Discard changes?', 'Your changes will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // ---- Loading state ----
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ---- Error state ----
  if (isError || !post) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Post not found</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
          The post you're trying to edit doesn't exist.
        </Text>
        <TouchableOpacity
          style={[styles.goBackButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ---- Check if current user is the author ----
  const isAuthor = user?.id === post.user?.id;
  if (!isAuthor) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Unauthorized</Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
          You don't have permission to edit this post.
        </Text>
        <TouchableOpacity
          style={[styles.goBackButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ---- Main render ----
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* ---- Header ---- */}
        <View style={[styles.header, { 
          backgroundColor: colors.surface, 
          borderBottomColor: colors.border 
        }]}>
          <TouchableOpacity onPress={handleCancel} disabled={isSaving}>
            <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Post</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSaving}
            style={[styles.saveButton, { backgroundColor: colors.primary }, isSaving && styles.saveButtonDisabled]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {/* ---- Text Input ---- */}
          <TextInput
            style={[styles.textInput, { 
              color: colors.text,
              backgroundColor: colors.background 
            }]}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.placeholder}
            multiline
            numberOfLines={6}
            value={text}
            onChangeText={setText}
            editable={!isSaving}
          />

          {/* ---- Media Preview ---- */}
          {(imageUri || videoUri || existingImage || existingVideo) && (
            <View style={[styles.mediaPreview, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              {!imageUri && !videoUri && existingImage && (
                <Image source={{ uri: existingImage }} style={styles.mediaImage} resizeMode="cover" />
              )}
              {imageUri && (
                <Image source={{ uri: imageUri }} style={styles.mediaImage} resizeMode="cover" />
              )}
              {!videoUri && !imageUri && existingVideo && (
                <View style={[styles.videoPreview, { backgroundColor: '#000' }]}>
                  <Feather name="play-circle" size={48} color="white" />
                  <Text style={styles.videoLabel}>Video</Text>
                </View>
              )}
              {videoUri && (
                <View style={[styles.videoPreview, { backgroundColor: '#000' }]}>
                  <Feather name="play-circle" size={48} color="white" />
                  <Text style={styles.videoLabel}>Video</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeMedia} onPress={removeMedia} disabled={isSaving}>
                <Feather name="x" size={20} color="white" />
              </TouchableOpacity>
            </View>
          )}

          {/* ---- Media Buttons ---- */}
          <View style={styles.mediaButtons}>
            <TouchableOpacity
              style={[styles.mediaButton, { 
                backgroundColor: isDark ? '#374151' : '#f3f4f6' 
              }, (isSaving || videoUri || existingVideo) && styles.mediaButtonDisabled]}
              onPress={pickImage}
              disabled={isSaving || !!videoUri || !!existingVideo}
            >
              <Feather name="image" size={24} color={colors.textSecondary} />
              <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Change Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaButton, { 
                backgroundColor: isDark ? '#374151' : '#f3f4f6' 
              }, (isSaving || imageUri || existingImage) && styles.mediaButtonDisabled]}
              onPress={pickVideo}
              disabled={isSaving || !!imageUri || !!existingImage}
            >
              <Feather name="video" size={24} color={colors.textSecondary} />
              <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Change Video</Text>
            </TouchableOpacity>
          </View>

          {/* ---- Post Info ---- */}
          <View style={[styles.infoContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Posted on</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {new Date(post.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  goBackButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  goBackText: {
    color: 'white',
    fontWeight: '600',
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
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  mediaPreview: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 100,
  },
  mediaImage: {
    width: '100%',
    height: 200,
  },
  videoPreview: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: {
    color: 'white',
    marginTop: 8,
    fontSize: 14,
  },
  removeMedia: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 4,
  },
  mediaButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  mediaButtonDisabled: {
    opacity: 0.4,
  },
  mediaButtonText: {
    fontSize: 14,
  },
  infoContainer: {
    marginTop: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  infoLabel: {
    fontSize: 12,
  },
  infoValue: {
    fontSize: 14,
    marginTop: 2,
  },
});