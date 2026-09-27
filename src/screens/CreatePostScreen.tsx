import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Modal,
  Dimensions,
  FlatList,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import api from '../api/client';

const { width, height } = Dimensions.get('window');

interface MentionUser {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  verified?: boolean;
}

// Extract "@username" tokens from a body of text. Used for the
// "mentioned users" preview row under the composer.
function extractMentionedUsernames(text: string): string[] {
  if (!text) return [];
  const re = /(^|\s)@([A-Za-z0-9_]{1,30})/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.add(match[2].toLowerCase());
  }
  return [...found];
}

export default function CreatePostScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);

  // ─── Mention autocomplete state ─────────────────────────────
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<number | null>(null);
  const forceSelection = pendingSelectionRef.current;

  const mentionedUsernames = extractMentionedUsernames(text);

  // ─── Detect an active @-mention at the cursor ───────────────
  const detectMention = useCallback((value: string, cursor: number) => {
    if (cursor <= 0) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    const before = value.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    if (lastAt === -1) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    const afterAt = before.slice(lastAt + 1);
    // If any whitespace between @ and cursor, the mention has ended.
    if (/\s/.test(afterAt)) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    // Require the @ to be at start of string or preceded by whitespace.
    if (lastAt > 0 && !/[\s\n]/.test(before[lastAt - 1])) {
      setMentionQuery(null);
      setMentionStart(-1);
      return;
    }
    setMentionStart(lastAt);
    setMentionQuery(afterAt);
  }, []);

  // ─── Fetch suggestions with debounce ────────────────────────
  useEffect(() => {
    if (mentionQuery === null) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    setSuggestionsLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/users', {
          params: { q: mentionQuery, limit: 6 },
        });
        const data = res.data;
        let list: any[] = [];
        if (Array.isArray(data)) list = data;
        else if (Array.isArray(data?.users)) list = data.users;
        else if (Array.isArray(data?.data)) list = data.data;
        else if (Array.isArray(data?.results)) list = data.results;
        else if (Array.isArray(data?.data?.users)) list = data.data.users;
        else if (Array.isArray(data?.data?.results)) list = data.data.results;

        // Normalise shape. Drop self.
        const mapped: MentionUser[] = list
          .map((u: any) => ({
            id: String(u.id ?? u.userId ?? u.user_id ?? ''),
            name: u.name || u.username || 'User',
            username: u.username || '',
            avatar: u.avatar || u.picture || u.profile_picture || null,
            verified: !!(u.verified ?? u.is_verified ?? u.isVerified),
          }))
          .filter((u) => u.username && u.id !== String(user?.id || ''));

        setSuggestions(mapped);
      } catch (err) {
        // Silent — the dropdown just shows nothing on error
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 220);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [mentionQuery, user?.id]);

  // ─── Handle typing ──────────────────────────────────────────
  const handleChangeText = (value: string) => {
    setText(value);
    // If the user typed, cursor is presumably at end of the change.
    // We'll re-validate on the next selection event anyway.
    detectMention(value, cursorPosition);
  };

  const handleSelectionChange = (e: any) => {
    if (pendingSelectionRef.current !== null) {
      // A programmatic selection is in flight; ignore the echo.
      return;
    }
    const pos = e.nativeEvent.selection.start;
    setCursorPosition(pos);
    detectMention(text, pos);
  };

  // ─── Insert a mention ──────────────────────────────────────
  const insertMention = (u: MentionUser) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(cursorPosition);
    const insertion = `@${u.username} `;
    const newText = before + insertion + after;
    const newCursor = before.length + insertion.length;

    setText(newText);
    setMentionQuery(null);
    setMentionStart(-1);
    setSuggestions([]);

    // Nudge RN to move the cursor. We set a pending selection; the
    // next onSelectionChange that echoes it clears the flag.
    pendingSelectionRef.current = newCursor;
    setCursorPosition(newCursor);
    setTimeout(() => {
      pendingSelectionRef.current = null;
    }, 60);

    inputRef.current?.focus();
  };

  // ─── Open the mention picker without typing @ ───────────────
  const openMentionPicker = () => {
    const pos = cursorPosition;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const needsSpace = before.length > 0 && !/[\s\n]$/.test(before);
    const newText = before + (needsSpace ? ' @' : '@') + after;
    const newCursor = (needsSpace ? before.length + 2 : before.length + 1);
    setText(newText);
    setCursorPosition(newCursor);
    setMentionStart(newCursor - 1);
    setMentionQuery('');
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // ---- Check if logged in ----
  if (!user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
            },
          ]}
        >
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

    setShowLoader(true);
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

      setText('');
      setImageUri(null);
      setVideoUri(null);

      queryClient.invalidateQueries({ queryKey: ['feed'] });

      setShowLoader(false);
      setLoading(false);

      navigateToFeed();
    } catch (error: any) {
      console.error('Post creation error:', error);
      setShowLoader(false);
      setLoading(false);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to create post. Please try again.'
      );
    }
  };

  // ---- Cancel ----
  const handleCancel = () => {
    if (text.trim() || imageUri || videoUri) {
      Alert.alert('Discard post?', 'Your draft will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setText('');
            setImageUri(null);
            setVideoUri(null);
            navigation.goBack();
          },
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

  // ---- Render Loader Modal ----
  const renderLoader = () => (
    <Modal transparent visible={showLoader} animationType="fade" statusBarTranslucent>
      <View style={[styles.loaderOverlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
        <View style={[styles.loaderContainer, { backgroundColor: colors.surface }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loaderTitle, { color: colors.text }]}>Posting...</Text>
          <Text style={[styles.loaderSubtitle, { color: colors.textSecondary }]}>
            Your post is being shared
          </Text>
        </View>
      </View>
    </Modal>
  );

  const showMentionDropdown = mentionQuery !== null && mentionStart >= 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* ─── Loader Modal ─── */}
      {renderLoader()}

      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={handleCancel} disabled={loading}>
          <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={[
            styles.postButton,
            { backgroundColor: colors.primary },
            loading && styles.postButtonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            {
              color: colors.text,
              backgroundColor: colors.background,
            },
          ]}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.placeholder}
          multiline
          numberOfLines={6}
          value={text}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          editable={!loading}
        />

        {/* ─── Mention autocomplete dropdown ─── */}
        {showMentionDropdown && (
          <View
            style={[
              styles.mentionDropdown,
              {
                backgroundColor: colors.surface || colors.background,
                borderColor: colors.border,
                shadowColor: isDark ? 'transparent' : '#000',
              },
            ]}
          >
            <View style={[styles.mentionHeader, { borderBottomColor: colors.border }]}>
              <Feather name="at-sign" size={12} color={colors.textMuted} />
              <Text style={[styles.mentionHeaderText, { color: colors.textMuted }]}>
                {mentionQuery ? `Searching "${mentionQuery}"` : 'Type a name'}
              </Text>
              {suggestionsLoading && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />
              )}
            </View>

            {suggestions.length === 0 && !suggestionsLoading ? (
              <View style={styles.mentionEmpty}>
                <Text style={[styles.mentionEmptyText, { color: colors.textMuted }]}>
                  {mentionQuery ? 'No users found' : 'Start typing to search'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={suggestions}
                keyExtractor={(u) => u.id}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={suggestions.length > 4}
                style={{ maxHeight: 220 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.mentionRow}
                    activeOpacity={0.7}
                    onPress={() => insertMention(item)}
                  >
                    <Avatar source={item.avatar || undefined} size={34} fallback={item.name} />
                    <View style={styles.mentionRowText}>
                      <View style={styles.mentionNameRow}>
                        <Text
                          style={[styles.mentionName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {item.verified && (
                          <VerificationBadge size={12} style={{ marginLeft: 4 }} />
                        )}
                      </View>
                      <Text
                        style={[styles.mentionUsername, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        @{item.username}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* ─── Mentioned users preview ─── */}
        {mentionedUsernames.length > 0 && (
          <View style={styles.mentionsPreviewRow}>
            <Feather name="at-sign" size={12} color={colors.textMuted} />
            <Text style={[styles.mentionsPreviewText, { color: colors.textSecondary }]}>
              Mentioning{' '}
              {mentionedUsernames.slice(0, 3).map((u, i) => (
                <Text key={u}>
                  <Text style={{ color: colors.primary }}>@{u}</Text>
                  {i < Math.min(mentionedUsernames.length, 3) - 1 ? ', ' : ''}
                </Text>
              ))}
              {mentionedUsernames.length > 3
                ? ` and ${mentionedUsernames.length - 3} more`
                : ''}
            </Text>
          </View>
        )}

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
            style={[
              styles.mediaButton,
              {
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
              },
            ]}
            onPress={pickImage}
            disabled={loading || !!videoUri}
          >
            <Feather name="image" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.mediaButton,
              {
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
              },
            ]}
            onPress={pickVideo}
            disabled={loading || !!imageUri}
          >
            <Feather name="video" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.mediaButton,
              {
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
              },
            ]}
            onPress={openMentionPicker}
            disabled={loading}
          >
            <Feather name="at-sign" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Mention</Text>
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

  // ─── Mention autocomplete ───
  mentionDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  mentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  mentionHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  mentionEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  mentionEmptyText: {
    fontSize: 13,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  mentionRowText: {
    flex: 1,
    minWidth: 0,
  },
  mentionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mentionName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  mentionUsername: {
    fontSize: 12,
    marginTop: 1,
  },

  // ─── Mentioned users preview ───
  mentionsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  mentionsPreviewText: {
    fontSize: 12,
    flex: 1,
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
    flexWrap: 'wrap',
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
  loaderOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  loaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  loaderSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
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