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

interface TopicSuggestion {
  topic: string;
  post_count: number;
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

// Extract "#tag" tokens from a body of text.
function extractHashtags(text: string): string[] {
  if (!text) return [];
  const re = /(^|\s)#([A-Za-z0-9_]{1,50})/g;
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

  // ─── Autocomplete state (shared for mentions and hashtags) ──
  const [cursorPosition, setCursorPosition] = useState(0);
  const [activeQuery, setActiveQuery] = useState<{ kind: 'mention' | 'hashtag'; start: number; query: string } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<TopicSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<number | null>(null);

  const mentionedUsernames = extractMentionedUsernames(text);
  const usedHashtags = extractHashtags(text);

  // ─── Detect an active @mention or #hashtag at the cursor ────
  const detectAutocomplete = useCallback((value: string, cursor: number) => {
    if (cursor <= 0) {
      setActiveQuery(null);
      return;
    }
    const before = value.slice(0, cursor);

    // Look for the last @ or # before the cursor. Whichever is later wins.
    const lastAt = before.lastIndexOf('@');
    const lastHash = before.lastIndexOf('#');
    const lastTriggerIdx = Math.max(lastAt, lastHash);
    if (lastTriggerIdx === -1) {
      setActiveQuery(null);
      return;
    }

    const trigger = before[lastTriggerIdx];
    const afterTrigger = before.slice(lastTriggerIdx + 1);

    // If any whitespace between trigger and cursor, the token has ended.
    if (/\s/.test(afterTrigger)) {
      setActiveQuery(null);
      return;
    }

    // The trigger must be at start of string or preceded by whitespace.
    if (lastTriggerIdx > 0 && !/[\s\n]/.test(before[lastTriggerIdx - 1])) {
      setActiveQuery(null);
      return;
    }

    // Mention text allows [A-Za-z0-9_] and up to 30 chars.
    // Hashtag text allows [A-Za-z0-9_] and up to 50 chars.
    const kind: 'mention' | 'hashtag' = trigger === '@' ? 'mention' : 'hashtag';
    const maxLen = kind === 'mention' ? 30 : 50;
    if (afterTrigger.length > maxLen) {
      setActiveQuery(null);
      return;
    }
    if (afterTrigger.length > 0 && !/^[A-Za-z0-9_]*$/.test(afterTrigger)) {
      setActiveQuery(null);
      return;
    }

    setActiveQuery({ kind, start: lastTriggerIdx, query: afterTrigger });
  }, []);

  // ─── Fetch suggestions with debounce ────────────────────────
  useEffect(() => {
    if (!activeQuery) {
      setMentionSuggestions([]);
      setHashtagSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    setSuggestionsLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        if (activeQuery.kind === 'mention') {
          const res = await api.get('/users', {
            params: { q: activeQuery.query, limit: 6 },
          });
          const data = res.data;
          let list: any[] = [];
          if (Array.isArray(data)) list = data;
          else if (Array.isArray(data?.users)) list = data.users;
          else if (Array.isArray(data?.data)) list = data.data;
          else if (Array.isArray(data?.results)) list = data.results;
          else if (Array.isArray(data?.data?.users)) list = data.data.users;
          else if (Array.isArray(data?.data?.results)) list = data.data.results;

          const mapped: MentionUser[] = list
            .map((u: any) => ({
              id: String(u.id ?? u.userId ?? u.user_id ?? ''),
              name: u.name || u.username || 'User',
              username: u.username || '',
              avatar: u.avatar || u.picture || u.profile_picture || null,
              verified: !!(u.verified ?? u.is_verified ?? u.isVerified),
            }))
            .filter((u) => u.username && u.id !== String(user?.id || ''));

          setMentionSuggestions(mapped);
          setHashtagSuggestions([]);
        } else {
          // Fetch trending topics once, filter locally. The endpoint
          // doesn't support a search query, so we pull a larger page
          // and filter client-side — cheap and works offline-ish.
          const res = await api.get('/topics', { params: { limit: 50 } });
          const data = res.data;
          let raw: any[] = [];
          if (Array.isArray(data)) raw = data;
          else if (Array.isArray(data?.topics)) raw = data.topics;
          else if (Array.isArray(data?.data)) raw = data.data;
          else if (Array.isArray(data?.results)) raw = data.results;

          const q = activeQuery.query.toLowerCase();
          const mapped: TopicSuggestion[] = raw
            .map((t: any) => ({
              topic: String(t.topic ?? t.tag ?? '').toLowerCase(),
              post_count: Number(t.post_count ?? t.count ?? 0),
            }))
            .filter((t) => t.topic && (!q || t.topic.includes(q)));

          setHashtagSuggestions(mapped.slice(0, 8));
          setMentionSuggestions([]);
        }
      } catch {
        // Silent — dropdown just shows nothing on error
        setMentionSuggestions([]);
        setHashtagSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 220);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [activeQuery, user?.id]);

  // ─── Handle typing ──────────────────────────────────────────
  const handleChangeText = (value: string) => {
    setText(value);
    detectAutocomplete(value, cursorPosition);
  };

  const handleSelectionChange = (e: any) => {
    if (pendingSelectionRef.current !== null) return;
    const pos = e.nativeEvent.selection.start;
    setCursorPosition(pos);
    detectAutocomplete(text, pos);
  };

  // ─── Insert a suggestion ───────────────────────────────────
  const insertToken = (insertion: string) => {
    if (!activeQuery) return;
    const before = text.slice(0, activeQuery.start);
    const after = text.slice(cursorPosition);
    const newText = before + insertion + after;
    const newCursor = before.length + insertion.length;

    setText(newText);
    setActiveQuery(null);
    setMentionSuggestions([]);
    setHashtagSuggestions([]);

    pendingSelectionRef.current = newCursor;
    setCursorPosition(newCursor);
    setTimeout(() => {
      pendingSelectionRef.current = null;
    }, 60);

    inputRef.current?.focus();
  };

  const insertMention = (u: MentionUser) => insertToken(`@${u.username} `);
  const insertHashtag = (t: TopicSuggestion) => insertToken(`#${t.topic} `);

  // ─── Open a mention / hashtag picker without typing the trigger ──
  const openMentionPicker = () => {
    const pos = cursorPosition;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const needsSpace = before.length > 0 && !/[\s\n]$/.test(before);
    const newText = before + (needsSpace ? ' @' : '@') + after;
    const newCursor = needsSpace ? before.length + 2 : before.length + 1;
    setText(newText);
    setCursorPosition(newCursor);
    setActiveQuery({ kind: 'mention', start: newCursor - 1, query: '' });
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const openHashtagPicker = () => {
    const pos = cursorPosition;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const needsSpace = before.length > 0 && !/[\s\n]$/.test(before);
    const newText = before + (needsSpace ? ' #' : '#') + after;
    const newCursor = needsSpace ? before.length + 2 : before.length + 1;
    setText(newText);
    setCursorPosition(newCursor);
    setActiveQuery({ kind: 'hashtag', start: newCursor - 1, query: '' });
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
      queryClient.invalidateQueries({ queryKey: ['topics'] });

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

  const showDropdown = !!activeQuery;
  const dropdownKind = activeQuery?.kind;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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

        {/* ─── Autocomplete dropdown (mentions OR hashtags) ─── */}
        {showDropdown && (
          <View
            style={[
              styles.autocompleteDropdown,
              {
                backgroundColor: colors.surface || colors.background,
                borderColor: colors.border,
                shadowColor: isDark ? 'transparent' : '#000',
              },
            ]}
          >
            <View style={[styles.autocompleteHeader, { borderBottomColor: colors.border }]}>
              <Feather
                name={dropdownKind === 'mention' ? 'at-sign' : 'hash'}
                size={12}
                color={colors.textMuted}
              />
              <Text style={[styles.autocompleteHeaderText, { color: colors.textMuted }]}>
                {activeQuery && activeQuery.query
                  ? `${dropdownKind === 'mention' ? 'Searching' : 'Tag'} "${activeQuery.query}"`
                  : dropdownKind === 'mention'
                  ? 'Type a name'
                  : 'Popular tags'}
              </Text>
              {suggestionsLoading && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />
              )}
            </View>

            {/* ── Mention suggestions ── */}
            {dropdownKind === 'mention' && (
              mentionSuggestions.length === 0 && !suggestionsLoading ? (
                <View style={styles.autocompleteEmpty}>
                  <Text style={[styles.autocompleteEmptyText, { color: colors.textMuted }]}>
                    {activeQuery?.query ? 'No users found' : 'Start typing to search'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={mentionSuggestions}
                  keyExtractor={(u) => u.id}
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={mentionSuggestions.length > 4}
                  style={{ maxHeight: 220 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.autocompleteRow}
                      activeOpacity={0.7}
                      onPress={() => insertMention(item)}
                    >
                      <Avatar source={item.avatar || undefined} size={34} fallback={item.name} />
                      <View style={styles.autocompleteRowText}>
                        <View style={styles.autocompleteNameRow}>
                          <Text
                            style={[styles.autocompleteName, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          {item.verified && (
                            <VerificationBadge size={12} style={{ marginLeft: 4 }} />
                          )}
                        </View>
                        <Text
                          style={[styles.autocompleteUsername, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          @{item.username}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )
            )}

            {/* ── Hashtag suggestions ── */}
            {dropdownKind === 'hashtag' && (
              hashtagSuggestions.length === 0 && !suggestionsLoading ? (
                <View style={styles.autocompleteEmpty}>
                  <Text style={[styles.autocompleteEmptyText, { color: colors.textMuted }]}>
                    {activeQuery?.query ? 'No tags match' : 'No trending tags right now'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={hashtagSuggestions}
                  keyExtractor={(t) => t.topic}
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={hashtagSuggestions.length > 4}
                  style={{ maxHeight: 220 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.autocompleteRow}
                      activeOpacity={0.7}
                      onPress={() => insertHashtag(item)}
                    >
                      <View style={[styles.hashtagIconWrap, { backgroundColor: isDark ? '#374151' : '#eef2ff' }]}>
                        <Feather name="hash" size={16} color={colors.primary} />
                      </View>
                      <View style={styles.autocompleteRowText}>
                        <Text
                          style={[styles.autocompleteName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          #{item.topic}
                        </Text>
                        <Text
                          style={[styles.autocompleteUsername, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {item.post_count} {item.post_count === 1 ? 'post' : 'posts'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )
            )}
          </View>
        )}

        {/* ─── Mentioned users preview ─── */}
        {mentionedUsernames.length > 0 && (
          <View style={styles.previewRow}>
            <Feather name="at-sign" size={12} color={colors.textMuted} />
            <Text style={[styles.previewText, { color: colors.textSecondary }]}>
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

        {/* ─── Hashtags preview ─── */}
        {usedHashtags.length > 0 && (
          <View style={styles.previewRow}>
            <Feather name="hash" size={12} color={colors.textMuted} />
            <Text style={[styles.previewText, { color: colors.textSecondary }]}>
              Tagged{' '}
              {usedHashtags.slice(0, 3).map((t, i) => (
                <Text key={t}>
                  <Text style={{ color: colors.primary }}>#{t}</Text>
                  {i < Math.min(usedHashtags.length, 3) - 1 ? ', ' : ''}
                </Text>
              ))}
              {usedHashtags.length > 3
                ? ` and ${usedHashtags.length - 3} more`
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
          <TouchableOpacity
            style={[
              styles.mediaButton,
              {
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
              },
            ]}
            onPress={openHashtagPicker}
            disabled={loading}
          >
            <Feather name="hash" size={24} color={colors.textSecondary} />
            <Text style={[styles.mediaButtonText, { color: colors.textSecondary }]}>Tag</Text>
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

  // ─── Autocomplete ───
  autocompleteDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  autocompleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  autocompleteHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  autocompleteEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  autocompleteEmptyText: {
    fontSize: 13,
  },
  autocompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  autocompleteRowText: {
    flex: 1,
    minWidth: 0,
  },
  autocompleteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autocompleteName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  autocompleteUsername: {
    fontSize: 12,
    marginTop: 1,
  },
  hashtagIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Preview rows ───
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  previewText: {
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