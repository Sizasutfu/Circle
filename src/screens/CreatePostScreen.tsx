import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

export default function CreatePostScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- Check if logged in ----
  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { 
          backgroundColor: colors.surface, 
          borderBottomColor: colors.border 
        }]}>
          <TouchableOpacity onPress={() => (navigation.navigate as any)('Login')}>
            <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.notLoggedInContainer}>
          <Feather name="lock" size={48} color={colors.textMuted} />
          <Text style={[styles.notLoggedInTitle, { color: colors.text }]}>Please sign in</Text>
          <Text style={[styles.notLoggedInSubtitle, { color: colors.textSecondary }]}>
            You need to be logged in to create a post.
          </Text>
          <TouchableOpacity
            style={[styles.signInButton, { backgroundColor: colors.primary }]}
            onPress={() => (navigation.navigate as any)('Login')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
      setVideoUri(null);
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
      setImageUri(null);
    }
  };

  // ---- Remove Media ----
  const removeMedia = () => {
    setImageUri(null);
    setVideoUri(null);
  };

  // ---- Navigate to Feed ----
  const navigateToFeed = () => {
    // Reset the navigation stack to go to Feed
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          { 
            name: 'Drawer',
            state: {
              index: 0,
              routes: [
                { 
                  name: 'Main',
                  state: {
                    index: 0,
                    routes: [{ name: 'Feed' }],
                  },
                },
              ],
            },
          },
        ],
      })
    );
  };

  // ---- Submit Post ----
  const handleSubmit = async () => {
    if (!text.trim() && !imageUri && !videoUri) {
      Alert.alert('Empty post', 'Please write something or add a photo/video.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append('text', text.trim());

      if (imageUri) {
        const filename = imageUri.split('/').pop() || 'photo.jpg';
        const fileType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
        formData.append('image', {
          uri: imageUri,
          name: filename,
          type: fileType,
        } as any);
      }

      if (videoUri) {
        const filename = videoUri.split('/').pop() || 'video.mp4';
        formData.append('video', {
          uri: videoUri,
          name: filename,
          type: 'video/mp4',
        } as any);
      }

      await api.post('/posts', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // ── Clear form ──
      setText('');
      setImageUri(null);
      setVideoUri(null);
      
      // ── Invalidate feed cache ──
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      
      // ── Navigate to Feed using reset ──
      navigateToFeed();
      
    } catch (error: any) {
      console.error('Post creation error:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to create post. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ---- Cancel ----
  const handleCancel = () => {
    if (text.trim() || imageUri || videoUri) {
      Alert.alert('Discard post?', 'Your draft will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => {
          setText('');
          setImageUri(null);
          setVideoUri(null);
          navigation.goBack();
        }},
      ]);
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { 
        backgroundColor: colors.surface, 
        borderBottomColor: colors.border 
      }]}>
        <TouchableOpacity onPress={handleCancel} disabled={loading}>
          <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={[styles.postButton, { backgroundColor: colors.primary }, loading && styles.postButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
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
          editable={!loading}
        />

        {(imageUri || videoUri) && (
          <View style={[styles.mediaPreview, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.mediaImage} resizeMode="cover" />
            )}
            {videoUri && (
              <View style={[styles.videoPreview, { backgroundColor: '#000' }]}>
                <Feather name="play-circle" size={48} color="white" />
                <Text style={styles.videoLabel}>Video</Text>
              </View>
            )}
            <TouchableOpacity style={styles.removeMedia} onPress={removeMedia} disabled={loading}>
              <Feather name="x" size={20} color="white" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.mediaButtons}>
          <TouchableOpacity
            style={[styles.mediaButton, { 
              backgroundColor: isDark ? '#374151' : '#f3f4f6' 
            }]}
            onPress={pickImage}
            disabled={loading || !!videoUri}
          >
            <Feather name="image" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mediaButton, { 
              backgroundColor: isDark ? '#374151' : '#f3f4f6' 
            }]}
            onPress={pickVideo}
            disabled={loading || !!imageUri}
          >
            <Feather name="video" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Video</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  postButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
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
  mediaButtonText: {
    fontSize: 14,
  },
  // ── Not logged in styles ──
  notLoggedInContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notLoggedInTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  notLoggedInSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  signInButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signInButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});