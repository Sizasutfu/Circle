import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGroups } from '../contexts/GroupsContext';
import { useTabBarHeight } from '../hooks/useTabBarHeight';
import { useVisibleItems } from '../hooks/useVisibleItems';
import PostCard from '../components/PostCard';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const STICKY_HEADER_HEIGHT = 56;
// The cover is 200px tall; the header reveal completes just before it
// scrolls fully under the sticky header.
const SCROLL_THRESHOLD = 180;
// The compact action button gets its own later window so it never
// duplicates the big Join button on the cover.
const ACTION_REVEAL_START = SCROLL_THRESHOLD + 40; // 220
const ACTION_REVEAL_END = SCROLL_THRESHOLD + 100;  // 280

function fmtNum(n: number): string {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export default function GroupDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { contentBottomPadding } = useTabBarHeight();
  const { visibleIds, viewabilityConfig, onViewableItemsChanged } = useVisibleItems();

  const groupId = (route.params as any)?.groupId;

  const {
    currentGroup,
    groupFeed,
    hasMoreGroupFeed,
    loadingGroupFeed,
    loadGroupDetail,
    loadGroupFeed,
    joinGroup,
    leaveGroup,
    postToGroup,
    myGroups,
    loadMyGroups,
    refreshKey,
    clearCurrentGroup,
  } = useGroups();

  const [activeTab, setActiveTab] = useState<'feed' | 'about'>('feed');
  const [composerText, setComposerText] = useState('');
  const [composerImage, setComposerImage] = useState<string | null>(null);
  const [composerVideo, setComposerVideo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);

  const initialFetchDone = useRef(false);

  // ── Scroll-driven sticky header (matches ProfileScreen) ──
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = insets.top + STICKY_HEADER_HEIGHT;

  const headerReveal = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 40, SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nameTranslateY = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 40, SCROLL_THRESHOLD],
    outputRange: [8, 0],
    extrapolate: 'clamp',
  });

  const actionOpacity = scrollY.interpolate({
    inputRange: [ACTION_REVEAL_START, ACTION_REVEAL_END],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const actionTranslateX = scrollY.interpolate({
    inputRange: [ACTION_REVEAL_START, ACTION_REVEAL_END],
    outputRange: [40, 0],
    extrapolate: 'clamp',
  });

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  // Load group on mount
  useEffect(() => {
    if (!groupId) return;
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (user) await loadMyGroups();
        await loadGroupDetail(groupId);
        await loadGroupFeed(groupId, true);
      } catch (err: any) {
        setError(err?.message || 'Failed to load group.');
      } finally {
        setLoading(false);
      }
    };
    run();

    return () => {
      clearCurrentGroup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, user?.id]);

  // Membership sync
  useEffect(() => {
    if (currentGroup && currentGroup.id) {
      const fromMyGroups = myGroups.some((g) => g.id === currentGroup.id);
      setIsMember(fromMyGroups || !!currentGroup.isMember);
    }
  }, [currentGroup, myGroups, refreshKey]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      (navigation.navigate as any)('Groups');
    }
  }, [navigation]);

  const handleJoinToggle = useCallback(async () => {
    if (!user) {
      (navigation.navigate as any)('Login');
      return;
    }
    setIsJoining(true);
    try {
      if (isMember) {
        await leaveGroup(groupId);
        setIsMember(false);
      } else {
        await joinGroup(groupId);
        setIsMember(true);
      }
    } catch {
      const fromMyGroups = myGroups.some((g) => g.id === Number(groupId));
      setIsMember(fromMyGroups || !!currentGroup?.isMember);
    } finally {
      setIsJoining(false);
    }
  }, [user, isMember, groupId, joinGroup, leaveGroup, myGroups, currentGroup, navigation]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow gallery access to pick an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      setComposerImage(res.assets[0].uri);
      setComposerVideo(null);
    }
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow gallery access to pick a video.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    });
    if (!res.canceled && res.assets[0]) {
      setComposerVideo(res.assets[0].uri);
      setComposerImage(null);
    }
  };

  const removeMedia = () => {
    setComposerImage(null);
    setComposerVideo(null);
  };

  const handlePost = async () => {
    if (!user || !isMember) return;
    if (!composerText.trim() && !composerImage && !composerVideo) return;
    setSubmitting(true);
    try {
      await postToGroup(groupId, composerText, composerImage, composerVideo);
      setComposerText('');
      setComposerImage(null);
      setComposerVideo(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMoreGroupFeed && !loadingGroupFeed) {
      loadGroupFeed(groupId, false);
    }
  };

  const renderPost = useCallback(
    ({ item }: { item: any }) => (
      <PostCard post={item} isVisible={visibleIds.has(String(item.id))} />
    ),
    [visibleIds]
  );

  // ── Sticky header (mirrors ProfileScreen's renderStickyHeader) ──
  const renderStickyHeader = () => (
    <Animated.View
      style={[
        styles.stickyHeader,
        {
          height: headerHeight,
          paddingTop: insets.top,
        },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: colors.background,
            opacity: headerReveal,
          },
        ]}
      />

      <View style={styles.stickyHeaderInner}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.stickyBackButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.stickyTitleWrap,
            {
              opacity: headerReveal,
              transform: [{ translateY: nameTranslateY }],
            },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[styles.stickyName, { color: colors.text }]}
            numberOfLines={1}
          >
            {String(currentGroup?.displayName || `#${currentGroup?.topic || 'Group'}`)}
          </Text>
          <Text
            style={[styles.stickyPostCount, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {currentGroup ? `${fmtNum(currentGroup.memberCount)} members` : ''}
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.stickyActionWrap,
            {
              opacity: actionOpacity,
              transform: [{ translateX: actionTranslateX }],
            },
          ]}
        >
          {user && currentGroup ? (
            <TouchableOpacity
              onPress={handleJoinToggle}
              disabled={isJoining}
              style={[
                styles.stickyJoinBtn,
                isMember
                  ? {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                    }
                  : { backgroundColor: colors.primary },
              ]}
              activeOpacity={0.8}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color={isMember ? colors.text : '#fff'} />
              ) : (
                <Text
                  style={[
                    styles.stickyJoinText,
                    { color: isMember ? colors.text : '#fff' },
                  ]}
                  numberOfLines={1}
                >
                  {isMember ? 'Following' : 'Join'}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </View>
    </Animated.View>
  );

  // ── Loading state (still has a back button so the user isn't stuck) ──
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ paddingTop: insets.top }}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.simpleBackButton}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading group…
          </Text>
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (error || !currentGroup) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={{ paddingTop: insets.top }}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.simpleBackButton}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {String(error || 'Group not found.')}
          </Text>
          <TouchableOpacity
            style={[styles.errorBtn, { backgroundColor: colors.primary }]}
            onPress={handleBack}
          >
            <Text style={styles.errorBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Header content (cover + tabs + composer) — no back button here,
  //    it lives in the sticky header so it can stay pinned on scroll. ──
  const renderHeaderContent = () => (
    <View>
      {/* Cover */}
      <View style={styles.coverWrap}>
        {currentGroup.coverImage ? (
          <ExpoImage
            source={{ uri: currentGroup.coverImage }}
            style={styles.cover}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, { backgroundColor: '#16151f' }]}>
            <Feather name="users" size={48} color="rgba(255,255,255,0.7)" />
          </View>
        )}
        <View style={styles.coverOverlay} />

        <View style={styles.coverContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.coverName} numberOfLines={1}>
              {String(currentGroup.displayName || `#${currentGroup.topic || ''}`)}
            </Text>
            {currentGroup.description ? (
              <Text style={styles.coverDesc} numberOfLines={2}>
                {String(currentGroup.description)}
              </Text>
            ) : null}
            <View style={styles.coverStats}>
              <Feather name="users" size={12} color="rgba(255,255,255,0.75)" />
              <Text style={styles.coverStatText}>
                {`${fmtNum(currentGroup.memberCount)} members`}
              </Text>
              <Feather
                name="radio"
                size={12}
                color="rgba(255,255,255,0.75)"
                style={{ marginLeft: 12 }}
              />
              <Text style={styles.coverStatText}>
                {`${fmtNum(currentGroup.postCount)} posts / 7d`}
              </Text>
            </View>
          </View>

          {user ? (
            <TouchableOpacity
              onPress={handleJoinToggle}
              disabled={isJoining}
              style={[
                styles.coverJoinBtn,
                isMember
                  ? { backgroundColor: 'rgba(255,255,255,0.2)' }
                  : { backgroundColor: colors.primary },
              ]}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.coverJoinText}>
                  {isMember ? '✓ Joined' : 'Join'}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        {(['feed', 'about'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tabBtn,
              activeTab === tab ? { borderBottomColor: colors.primary } : null,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.primary : colors.textSecondary },
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Composer */}
      {activeTab === 'feed' ? (
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.composerTop}>
            <View
              style={[styles.composerAvatar, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.composerAvatarText}>
                {String(user?.name?.charAt(0)?.toUpperCase() || '?')}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              {isMember ? (
                <View>
                  <TextInput
                    style={[styles.composerInput, { color: colors.text }]}
                    placeholder="What's on your mind?"
                    placeholderTextColor={colors.placeholder}
                    multiline
                    value={composerText}
                    onChangeText={setComposerText}
                    editable={!submitting}
                  />

                  {composerImage || composerVideo ? (
                    <View style={styles.previewWrap}>
                      {composerImage ? (
                        <Image
                          source={{ uri: composerImage }}
                          style={styles.previewImg}
                        />
                      ) : null}
                      {composerVideo ? (
                        <View style={[styles.previewImg, styles.videoPreview]}>
                          <Feather name="play-circle" size={36} color="#fff" />
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={styles.previewRemove}
                        onPress={removeMedia}
                      >
                        <Feather name="x" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.composerActions,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={pickImage}
                      style={styles.composerIcon}
                      disabled={submitting}
                    >
                      <Feather name="image" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={pickVideo}
                      style={styles.composerIcon}
                      disabled={submitting}
                    >
                      <Feather name="video" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <View style={{ flex: 1 }} />

                    <TouchableOpacity
                      onPress={handlePost}
                      disabled={
                        submitting ||
                        (!composerText.trim() && !composerImage && !composerVideo)
                      }
                      style={[
                        styles.postBtn,
                        { backgroundColor: colors.primary },
                        submitting ? { opacity: 0.5 } : null,
                      ]}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.postBtnText}>Post</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.joinPrompt}>
                  <Text
                    style={[
                      styles.joinPromptText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Join this group to start posting
                  </Text>
                  <TouchableOpacity
                    onPress={handleJoinToggle}
                    disabled={isJoining}
                    style={[
                      styles.joinNowBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.joinNowText}>
                      {isJoining ? '…' : 'Join Now'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  // ── About tab ──
  if (activeTab === 'about') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: contentBottomPadding + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: headerHeight }} />
          {renderHeaderContent()}

          <View
            style={[
              styles.aboutCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.aboutDesc, { color: colors.text }]}>
              {String(currentGroup.description || 'No description provided.')}
            </Text>
            <View style={styles.aboutStats}>
              <Text style={[styles.aboutStat, { color: colors.textSecondary }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {fmtNum(currentGroup.memberCount)}
                </Text>
                {' members'}
              </Text>
              <Text style={[styles.aboutStat, { color: colors.textSecondary }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {fmtNum(currentGroup.postCount)}
                </Text>
                {' posts / 7d'}
              </Text>
              <Text style={[styles.aboutStat, { color: colors.textSecondary }]}>
                {'Topic: '}
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  {`#${currentGroup.topic || ''}`}
                </Text>
              </Text>
            </View>
          </View>
        </Animated.ScrollView>

        {renderStickyHeader()}
      </View>
    );
  }

  // ── Feed tab ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AnimatedFlatList
          data={groupFeed}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderPost}
          ListHeaderComponent={
            <View>
              <View style={{ height: headerHeight }} />
              {renderHeaderContent()}
            </View>
          }
          contentContainerStyle={{
            paddingBottom: contentBottomPadding + 40,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListFooterComponent={
            loadingGroupFeed && hasMoreGroupFeed ? (
              <ActivityIndicator
                style={{ marginVertical: 16 }}
                color={colors.primary}
              />
            ) : null
          }
          ListEmptyComponent={
            loadingGroupFeed ? null : (
              <View style={styles.empty}>
                <Feather name="message-square" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No posts yet
                </Text>
                <Text
                  style={[styles.emptySubtitle, { color: colors.textSecondary }]}
                >
                  Be the first to post in this group.
                </Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>

      {renderStickyHeader()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorText: { marginTop: 12, fontSize: 16 },
  errorBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorBtnText: { color: '#fff', fontWeight: '600' },

  // ── Simple back button (loading + error states) ──
  simpleBackButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // ── Sticky header (matches ProfileScreen) ──
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    justifyContent: 'flex-end',
  },
  stickyHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: STICKY_HEADER_HEIGHT,
  },
  stickyBackButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyTitleWrap: {
    flex: 1,
    marginLeft: 8,
  },
  stickyName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  stickyPostCount: {
    fontSize: 12,
    marginTop: 1,
  },
  stickyActionWrap: {
    marginLeft: 8,
  },
  stickyJoinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyJoinText: {
    fontWeight: '600',
    fontSize: 13,
  },

  // ── Cover ──
  coverWrap: {
    height: 200,
    position: 'relative',
    backgroundColor: '#000',
  },
  cover: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  coverContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  coverName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  coverDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  coverStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  coverStatText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginLeft: 4,
  },
  coverJoinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  coverJoinText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Tabs ──
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Composer ──
  composer: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  composerTop: {
    flexDirection: 'row',
    gap: 10,
  },
  composerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerAvatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  composerInput: {
    fontSize: 15,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  previewWrap: {
    marginTop: 8,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  previewImg: {
    width: 160,
    height: 120,
    borderRadius: 8,
  },
  videoPreview: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  composerIcon: {
    padding: 4,
  },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 999,
  },
  postBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  joinPrompt: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  joinPromptText: {
    fontSize: 13,
  },
  joinNowBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 999,
  },
  joinNowText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // ── About tab ──
  aboutCard: {
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  aboutDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  aboutStats: {
    marginTop: 12,
    gap: 6,
  },
  aboutStat: {
    fontSize: 13,
  },

  // ── Empty state ──
  empty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
});