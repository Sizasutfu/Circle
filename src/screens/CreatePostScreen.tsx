// src/screens/CreatePostScreen.tsx
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
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from '../components/Avatar';
import VerificationBadge from '../components/VerificationBadge';
import api from '../api/client';

const { width, height } = Dimensions.get('window');

const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB

type Mode = 'post' | 'music';
type TrackStatus = 'ready' | 'uploading' | 'done' | 'error';

interface TrackItem {
  id: string;
  uri: string;
  filename: string;
  size?: number;
  mimeType?: string;
  title: string;
  artist: string;
  status: TrackStatus;
  progress: number;
  error: string | null;
}

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

// ── Music helpers ────────────────────────────────────────────
function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseFilename(filename: string): { title: string; artist: string } {
  let s = filename.replace(/\.[^/.]+$/, '');
  s = s.replace(/_/g, ' ').trim();
  s = s.replace(/\s*[\(\[]\s*\d{1,4}\s*k(?:bps)?\s*[\)\]]/gi, '');
  s = s.replace(
    /\s*[\(\[]\s*official\s*(music\s*)?(audio|video|lyric[s]?\s*video)\s*[\)\]]/gi,
    ''
  );
  s = s.replace(/\s+/g, ' ').trim();

  const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (
    m &&
    m[1].length >= 2 &&
    m[1].length <= 40 &&
    !/^[\d\s\-–—.]+$/.test(m[1])
  ) {
    return { artist: m[1].trim(), title: m[2].trim() };
  }
  return { artist: '', title: s };
}

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

// ── Track row ────────────────────────────────────────────────
function TrackRow({
  item,
  onUpdate,
  onRemove,
  disabled,
  colors,
  isDark,
}: {
  item: TrackItem;
  onUpdate: (patch: Partial<TrackItem>) => void;
  onRemove: () => void;
  disabled: boolean;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.trackRow,
        {
          backgroundColor: isDark ? '#1f2937' : '#f9fafb',
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.trackRowTop}>
        <View
          style={[
            styles.trackIconWrap,
            { backgroundColor: isDark ? '#374151' : '#eef2ff' },
          ]}
        >
          <Feather name="music" size={18} color={colors.primary} />
        </View>
        <View style={styles.trackMeta}>
          <Text
            numberOfLines={1}
            style={[styles.trackFilename, { color: colors.textMuted }]}
          >
            {item.filename}
          </Text>
          <Text style={[styles.trackSize, { color: colors.textMuted }]}>
            {item.size ? formatBytes(item.size) : '—'}
          </Text>
        </View>
        {item.status !== 'done' && (
          <TouchableOpacity
            onPress={onRemove}
            disabled={disabled}
            style={styles.trackRemoveBtn}
            hitSlop={8}
          >
            <Feather name="x" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        value={item.title}
        onChangeText={(v) => onUpdate({ title: v })}
        placeholder="Title"
        placeholderTextColor={colors.placeholder}
        editable={!disabled}
        style={[
          styles.trackInput,
          {
            color: colors.text,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />
      <TextInput
        value={item.artist}
        onChangeText={(v) => onUpdate({ artist: v })}
        placeholder="Artist (optional)"
        placeholderTextColor={colors.placeholder}
        editable={!disabled}
        style={[
          styles.trackInput,
          {
            color: colors.text,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      />

      {item.status === 'uploading' && (
        <View style={styles.trackProgressRow}>
          <View
            style={[styles.trackProgressBar, { backgroundColor: colors.border }]}
          >
            <View
              style={[
                styles.trackProgressFill,
                { backgroundColor: colors.primary, width: `${item.progress}%` },
              ]}
            />
          </View>
          <Text style={[styles.trackProgressText, { color: colors.textMuted }]}>
            {item.progress}%
          </Text>
        </View>
      )}

      {item.status === 'done' && (
        <View style={styles.trackStatusRow}>
          <Feather name="check-circle" size={14} color="#10b981" />
          <Text style={[styles.trackStatusText, { color: '#10b981' }]}>
            Uploaded
          </Text>
        </View>
      )}

      {item.status === 'error' && (
        <View style={styles.trackStatusRow}>
          <Feather name="alert-circle" size={14} color="#ef4444" />
          <Text style={[styles.trackStatusText, { color: '#ef4444' }]}>
            {item.error || 'Upload failed'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────
export default function CreatePostScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [mode, setMode] = useState<Mode>('post');

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);

  // Music state
  const [tracks, setTracks] = useState<TrackItem[]>([]);

  // Autocomplete state
  const [cursorPosition, setCursorPosition] = useState(0);
  const [activeQuery, setActiveQuery] = useState<{
    kind: 'mention' | 'hashtag';
    start: number;
    query: string;
  } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<TopicSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSelectionRef = useRef<number | null>(null);

  const mentionedUsernames = extractMentionedUsernames(text);
  const usedHashtags = extractHashtags(text);

  const detectAutocomplete = useCallback((value: string, cursor: number) => {
    if (cursor <= 0) {
      setActiveQuery(null);
      return;
    }
    const before = value.slice(0, cursor);
    const lastAt = before.lastIndexOf('@');
    const lastHash = before.lastIndexOf('#');
    const lastTriggerIdx = Math.max(lastAt, lastHash);
    if (lastTriggerIdx === -1) {
      setActiveQuery(null);
      return;
    }
    const trigger = before[lastTriggerIdx];
    const afterTrigger = before.slice(lastTriggerIdx + 1);
    if (/\s/.test(afterTrigger)) {
      setActiveQuery(null);
      return;
    }
    if (lastTriggerIdx > 0 && !/[\s\n]/.test(before[lastTriggerIdx - 1])) {
      setActiveQuery(null);
      return;
    }
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

  // ── Music: file picking ─────────────────────────────────────
  const pickAudioFiles = async () => {
    if (loading) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      // Handle both old & new API shapes defensively
      const canceled =
        (result as any).canceled ?? (result as any).type === 'cancel';
      if (canceled) return;

      const assets: any[] =
        (result as any).assets ??
        ((result as any).type === 'success' ? [result] : []);

      if (!assets.length) return;

      const picked: TrackItem[] = [];
      const rejected: string[] = [];

      for (const asset of assets) {
        const uri: string = asset.uri;
        const filename: string =
          asset.name || uri.split('/').pop() || `track-${Date.now()}.mp3`;
        const size: number | undefined =
          typeof asset.size === 'number' ? asset.size : undefined;

        if (size && size > MAX_AUDIO_SIZE) {
          rejected.push(filename);
          continue;
        }

        const { title, artist } = parseFilename(filename);

        picked.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uri,
          filename,
          size,
          mimeType: asset.mimeType,
          title,
          artist,
          status: 'ready',
          progress: 0,
          error: null,
        });
      }

      if (picked.length) {
        setTracks((prev) => [...prev, ...picked]);
      }

      if (rejected.length) {
        Alert.alert(
          'Some files skipped',
          `These exceed the ${formatBytes(MAX_AUDIO_SIZE)} limit:\n\n${rejected.join(
            '\n'
          )}`
        );
      }
    } catch (err: any) {
      console.error('Audio pick error:', err);
      Alert.alert('Error', 'Could not open the file picker.');
    }
  };

  const updateTrack = (id: string, patch: Partial<TrackItem>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTrack = (id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUploadTracks = async () => {
    const ready = tracks.filter((t) => t.status === 'ready');
    if (!ready.length) {
      Alert.alert('Nothing to upload', 'Add at least one audio file.');
      return;
    }
    if (!ready.every((t) => t.title.trim())) {
      Alert.alert('Missing title', 'Every track needs a title.');
      return;
    }

    setLoading(true);
    let successCount = 0;
    let lastError: string | null = null;

    for (const item of ready) {
      updateTrack(item.id, { status: 'uploading', progress: 0, error: null });

      const formData = new FormData();
      formData.append('audio', {
        uri: item.uri,
        name: item.filename,
        type: item.mimeType || 'audio/mpeg',
      } as any);
      formData.append('title', item.title.trim());
      if (item.artist.trim()) formData.append('artist', item.artist.trim());

      try {
        await api.post('/tracks', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e: any) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            updateTrack(item.id, { progress: pct });
          },
        });
        updateTrack(item.id, { status: 'done', progress: 100 });
        successCount += 1;
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || 'Upload failed';
        lastError = msg;
        updateTrack(item.id, { status: 'error', error: msg });
      }
    }

    setLoading(false);

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['circle-tracks'] });
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      Alert.alert(
        'Done',
        `${successCount} track${successCount === 1 ? '' : 's'} uploaded.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setTracks([]);
              navigation.goBack();
            },
          },
        ]
      );
    } else if (lastError) {
      Alert.alert('Upload failed', lastError);
    }
  };

  // Not logged in
  if (!user) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View
          style={[
            styles.header,
            { backgroundColor: colors.background, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity onPress={() => (navigation.navigate as any)('Login')}>
            <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.notLoggedInContainer}>
          <Feather name="lock" size={48} color={colors.textMuted} />
          <Text style={[styles.notLoggedInTitle, { color: colors.text }]}>
            Please sign in
          </Text>
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

  // Pick image
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

  // Pick video
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

  const removeMedia = () => {
    setImageUri(null);
    setVideoUri(null);
  };

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
                { name: 'Main', state: { index: 0, routes: [{ name: 'Feed' }] } },
              ],
            },
          },
        ],
      })
    );
  };

  const handleSubmit = async () => {
    if (mode === 'music') {
      await handleUploadTracks();
      return;
    }

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
        headers: { 'Content-Type': 'multipart/form-data' },
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

  const handleCancel = () => {
    const hasPostContent = text.trim() || imageUri || videoUri;
    const hasTrackContent = tracks.length > 0;

    if (hasPostContent || hasTrackContent) {
      Alert.alert('Discard?', 'Your work will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setText('');
            setImageUri(null);
            setVideoUri(null);
            setTracks([]);
            navigation.goBack();
          },
        },
      ]);
    } else {
      navigation.goBack();
    }
  };

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

  const showDropdown = !!activeQuery && mode === 'post';
  const dropdownKind = activeQuery?.kind;
  const readyCount = tracks.filter((t) => t.status === 'ready').length;

  const submitLabel =
    mode === 'post' ? 'Post' : readyCount > 0 ? `Upload ${readyCount}` : 'Upload';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {renderLoader()}

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={handleCancel} disabled={loading}>
          <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {mode === 'post' ? 'New Post' : 'Upload Music'}
        </Text>
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
            <Text style={styles.postButtonText}>{submitLabel}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Mode toggle */}
      <View
        style={[
          styles.modeToggle,
          { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
        ]}
      >
        <TouchableOpacity
          onPress={() => setMode('post')}
          disabled={loading}
          style={[
            styles.modeButton,
            mode === 'post' && { backgroundColor: colors.primary },
          ]}
        >
          <Feather
            name="edit-3"
            size={14}
            color={mode === 'post' ? '#fff' : colors.textSecondary}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'post' ? '#fff' : colors.textSecondary },
            ]}
          >
            Post
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode('music')}
          disabled={loading}
          style={[
            styles.modeButton,
            mode === 'music' && { backgroundColor: colors.primary },
          ]}
        >
          <Feather
            name="music"
            size={14}
            color={mode === 'music' ? '#fff' : colors.textSecondary}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'music' ? '#fff' : colors.textSecondary },
            ]}
          >
            Music
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* POST MODE */}
        {mode === 'post' && (
          <>
            <TextInput
              ref={inputRef}
              style={[
                styles.textInput,
                { color: colors.text, backgroundColor: colors.background },
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
                <View
                  style={[
                    styles.autocompleteHeader,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Feather
                    name={dropdownKind === 'mention' ? 'at-sign' : 'hash'}
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.autocompleteHeaderText,
                      { color: colors.textMuted },
                    ]}
                  >
                    {activeQuery && activeQuery.query
                      ? `${
                          dropdownKind === 'mention' ? 'Searching' : 'Tag'
                        } "${activeQuery.query}"`
                      : dropdownKind === 'mention'
                      ? 'Type a name'
                      : 'Popular tags'}
                  </Text>
                  {suggestionsLoading && (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>

                {dropdownKind === 'mention' &&
                  (mentionSuggestions.length === 0 && !suggestionsLoading ? (
                    <View style={styles.autocompleteEmpty}>
                      <Text
                        style={[
                          styles.autocompleteEmptyText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {activeQuery?.query
                          ? 'No users found'
                          : 'Start typing to search'}
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
                          <Avatar
                            source={item.avatar || undefined}
                            size={34}
                            fallback={item.name}
                          />
                          <View style={styles.autocompleteRowText}>
                            <View style={styles.autocompleteNameRow}>
                              <Text
                                style={[
                                  styles.autocompleteName,
                                  { color: colors.text },
                                ]}
                                numberOfLines={1}
                              >
                                {item.name}
                              </Text>
                              {item.verified && (
                                <VerificationBadge
                                  size={12}
                                  style={{ marginLeft: 4 }}
                                />
                              )}
                            </View>
                            <Text
                              style={[
                                styles.autocompleteUsername,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              @{item.username}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
                  ))}

                {dropdownKind === 'hashtag' &&
                  (hashtagSuggestions.length === 0 && !suggestionsLoading ? (
                    <View style={styles.autocompleteEmpty}>
                      <Text
                        style={[
                          styles.autocompleteEmptyText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {activeQuery?.query
                          ? 'No tags match'
                          : 'No trending tags right now'}
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
                          <View
                            style={[
                              styles.hashtagIconWrap,
                              {
                                backgroundColor: isDark ? '#374151' : '#eef2ff',
                              },
                            ]}
                          >
                            <Feather name="hash" size={16} color={colors.primary} />
                          </View>
                          <View style={styles.autocompleteRowText}>
                            <Text
                              style={[
                                styles.autocompleteName,
                                { color: colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              #{item.topic}
                            </Text>
                            <Text
                              style={[
                                styles.autocompleteUsername,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {item.post_count}{' '}
                              {item.post_count === 1 ? 'post' : 'posts'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    />
                  ))}
              </View>
            )}

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
              <View
                style={[
                  styles.mediaPreview,
                  { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
                ]}
              >
                {imageUri && (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.mediaImage}
                    resizeMode="cover"
                  />
                )}
                {videoUri && (
                  <View style={[styles.videoPreview, { backgroundColor: '#000' }]}>
                    <Feather name="play-circle" size={48} color="white" />
                    <Text style={styles.videoLabel}>Video</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeMedia}
                  onPress={removeMedia}
                  disabled={loading}
                >
                  <Feather name="x" size={20} color="white" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.mediaButtons}>
              <TouchableOpacity
                style={[
                  styles.mediaButton,
                  { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
                ]}
                onPress={pickImage}
                disabled={loading || !!videoUri}
              >
                <Feather name="image" size={24} color={colors.textSecondary} />
                <Text
                  style={[styles.mediaButtonText, { color: colors.textSecondary }]}
                >
                  Photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.mediaButton,
                  { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
                ]}
                onPress={pickVideo}
                disabled={loading || !!imageUri}
              >
                <Feather name="video" size={24} color={colors.textSecondary} />
                <Text
                  style={[styles.mediaButtonText, { color: colors.textSecondary }]}
                >
                  Video
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.mediaButton,
                  { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
                ]}
                onPress={openMentionPicker}
                disabled={loading}
              >
                <Feather name="at-sign" size={24} color={colors.textSecondary} />
                <Text
                  style={[styles.mediaButtonText, { color: colors.textSecondary }]}
                >
                  Mention
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.mediaButton,
                  { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
                ]}
                onPress={openHashtagPicker}
                disabled={loading}
              >
                <Feather name="hash" size={24} color={colors.textSecondary} />
                <Text
                  style={[styles.mediaButtonText, { color: colors.textSecondary }]}
                >
                  Tag
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* MUSIC MODE */}
        {mode === 'music' && (
          <>
            <TouchableOpacity
              onPress={pickAudioFiles}
              disabled={loading}
              activeOpacity={0.8}
              style={[
                styles.musicDropZone,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <Feather name="plus-circle" size={32} color={colors.primary} />
              <Text style={[styles.musicDropTitle, { color: colors.text }]}>
                Pick from your device
              </Text>
              <Text style={[styles.musicDropSubtitle, { color: colors.textMuted }]}>
                MP3, M4A, WAV — up to {formatBytes(MAX_AUDIO_SIZE)} per file
              </Text>
            </TouchableOpacity>

            {tracks.length > 0 && (
              <View style={styles.trackList}>
                {tracks.map((item) => (
                  <TrackRow
                    key={item.id}
                    item={item}
                    onUpdate={(patch) => updateTrack(item.id, patch)}
                    onRemove={() => removeTrack(item.id)}
                    disabled={loading}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
              </View>
            )}

            {tracks.length === 0 && (
              <View style={styles.musicEmptyHint}>
                <Feather name="info" size={14} color={colors.textMuted} />
                <Text
                  style={[styles.musicEmptyHintText, { color: colors.textMuted }]}
                >
                  Add one or more audio files. Titles are auto-filled from the
                  filename, and you can edit them before uploading.
                </Text>
              </View>
            )}
          </>
        )}
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
  cancelButton: { fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  postButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  postButtonDisabled: { opacity: 0.6 },
  postButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },

  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeButtonText: { fontSize: 13, fontWeight: '600' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },

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
  autocompleteEmpty: { padding: 16, alignItems: 'center' },
  autocompleteEmptyText: { fontSize: 13 },
  autocompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  autocompleteRowText: { flex: 1, minWidth: 0 },
  autocompleteNameRow: { flexDirection: 'row', alignItems: 'center' },
  autocompleteName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  autocompleteUsername: { fontSize: 12, marginTop: 1 },
  hashtagIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  previewText: { fontSize: 12, flex: 1 },

  mediaPreview: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 100,
  },
  mediaImage: { width: '100%', height: 200 },
  videoPreview: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: { color: 'white', marginTop: 8, fontSize: 14 },
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
  mediaButtonText: { fontSize: 14 },

  musicDropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  musicDropTitle: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  musicDropSubtitle: { fontSize: 12, textAlign: 'center' },
  trackList: { marginTop: 20, gap: 12 },
  trackRow: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  trackRowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackMeta: { flex: 1, minWidth: 0 },
  trackFilename: { fontSize: 11, fontWeight: '500' },
  trackSize: { fontSize: 11, marginTop: 1 },
  trackRemoveBtn: { padding: 4 },
  trackInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  trackProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  trackProgressBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  trackProgressFill: { height: '100%', borderRadius: 2 },
  trackProgressText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
  trackStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  trackStatusText: { fontSize: 12, fontWeight: '500' },
  musicHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  musicHintText: { flex: 1, fontSize: 13 },
  musicEmptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  musicEmptyHintText: { flex: 1, fontSize: 12, lineHeight: 18 },

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
  loaderTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  loaderSubtitle: { fontSize: 14, marginTop: 4 },

  notLoggedInContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notLoggedInTitle: { fontSize: 20, fontWeight: '600', marginTop: 16 },
  notLoggedInSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  signInButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signInButtonText: { color: 'white', fontWeight: '600', fontSize: 16 },
});