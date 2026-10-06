import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';
import { formatNumber } from '../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 120;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2;

interface DayEngagement {
  date: string;
  likes: number;
  comments: number;
  reposts: number;
}

interface RecentPost {
  id: number | string;
  text: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
}

interface DashboardStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  totalViews: number;
  totalVideoViews: number;
  engagementByDay: DayEngagement[];
  recentPosts: RecentPost[];
  topPost: { id: number | string; text: string; score: number } | null;
}

/* ------------------------------------------------------------------ */
/* Animated entry wrapper                                              */
/* ------------------------------------------------------------------ */
function FadeInUp({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: React.ReactNode;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton loader                                                     */
/* ------------------------------------------------------------------ */
function Skeleton({ width, height, radius = 8, style }: any) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: '#94a3b8', opacity },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
export default function DashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const surface = isDark ? '#1e2430' : '#ffffff';
  const surfaceAlt = isDark ? '#242b3a' : '#f6f7fb';
  const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
  const shadow = {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 14,
    elevation: 3,
  };

  const {
    data: stats,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not logged in');
      const response = await api.get(`/users/${user.id}/dashboard`);
      const body = response.data?.data ?? response.data ?? {};
      return body as DashboardStats;
    },
    enabled: !!user,
  });

  /* ── Chart scaling ── */
  const chartMax = useMemo(() => {
    if (!stats?.engagementByDay?.length) return 1;
    const max = Math.max(
      ...stats.engagementByDay.map(
        (d) => (d.likes || 0) + (d.comments || 0) + (d.reposts || 0)
      )
    );
    return Math.max(1, max);
  }, [stats?.engagementByDay]);

  const dayLabel = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
    } catch {
      return '';
    }
  };

  /* ────────────────────────────────────────────────────────────── */
  /* Loading                                                         */
  /* ────────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.scrollContent}>
          <Skeleton width={160} height={28} style={{ marginBottom: 8 }} />
          <Skeleton width={220} height={16} style={{ marginBottom: 24 }} />

          <View style={styles.statsGrid}>
            {[...Array(4)].map((_, i) => (
              <Skeleton
                key={i}
                width={CARD_WIDTH}
                height={100}
                radius={18}
                style={{ marginBottom: CARD_GAP }}
              />
            ))}
          </View>

          <Skeleton width="100%" height={200} radius={18} style={{ marginTop: 8 }} />
        </View>
      </SafeAreaView>
    );
  }

  /* ────────────────────────────────────────────────────────────── */
  /* Error                                                           */
  /* ────────────────────────────────────────────────────────────── */
  if (isError || !stats) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <View style={[styles.errorIconWrap, { backgroundColor: '#ef444420' }]}>
            <Feather name="alert-circle" size={40} color="#ef4444" />
          </View>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load</Text>
          <Text style={[styles.errorSub, { color: colors.textSecondary }]}>
            We couldn't fetch your dashboard. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
            activeOpacity={0.85}
          >
            <Feather name="refresh-cw" size={16} color="white" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalEngagement =
    (stats.totalLikes || 0) + (stats.totalComments || 0) + (stats.totalReposts || 0);

  const stats_items = [
    { icon: 'file-text',      label: 'Posts',      value: stats.postsCount,      color: '#6C63FF' },
    { icon: 'users',          label: 'Followers',  value: stats.followersCount,  color: '#3b82f6' },
    { icon: 'user-plus',      label: 'Following',  value: stats.followingCount,  color: '#8b5cf6' },
    { icon: 'heart',          label: 'Likes',      value: stats.totalLikes,      color: '#ef4444' },
    { icon: 'message-circle', label: 'Comments',   value: stats.totalComments,   color: '#0ea5e9' },
    { icon: 'repeat',         label: 'Reposts',    value: stats.totalReposts,    color: '#22c55e' },
    { icon: 'eye',            label: 'Views',      value: stats.totalViews,      color: '#f59e0b' },
    { icon: 'play-circle',    label: 'Video Views',value: stats.totalVideoViews, color: '#ec4899' },
  ] as const;

  /* ────────────────────────────────────────────────────────────── */
  /* Main                                                            */
  /* ────────────────────────────────────────────────────────────── */
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.iconBtn, { backgroundColor: surfaceAlt }]}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.iconBtn, { backgroundColor: surfaceAlt }]}
        >
          <Feather name="refresh-cw" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Hero greeting ── */}
        <FadeInUp delay={0}>
          <LinearGradient
            colors={
              isDark
                ? ['#312e81', '#4c1d95', '#6C63FF']
                : ['#6C63FF', '#8b5cf6', '#a855f7']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>
                  {(user?.name?.[0] || 'U').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroName} numberOfLines={1}>
                  Hi, {user?.name?.split(' ')[0] || 'there'} 👋
                </Text>
                <Text style={styles.heroSub}>Here's how your Circle is doing</Text>
              </View>
            </View>

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {formatNumber(totalEngagement)}
                </Text>
                <Text style={styles.heroStatLabel}>Interactions</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {formatNumber(stats.totalViews)}
                </Text>
                <Text style={styles.heroStatLabel}>Views</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {formatNumber(stats.followersCount)}
                </Text>
                <Text style={styles.heroStatLabel}>Followers</Text>
              </View>
            </View>
          </LinearGradient>
        </FadeInUp>

        {/* ── Stats grid ── */}
        <FadeInUp delay={80}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Overview
          </Text>
          <View style={styles.statsGrid}>
            {stats_items.map((s, i) => (
              <View
                key={s.label}
                style={[
                  styles.statCard,
                  {
                    backgroundColor: surface,
                    borderColor: border,
                    ...shadow,
                  },
                ]}
              >
                <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                  <Feather name={s.icon as any} size={16} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {formatNumber(s.value || 0)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </FadeInUp>

        {/* ── Chart ── */}
        {stats.engagementByDay?.length > 0 && (
          <FadeInUp delay={140}>
            <View
              style={[
                styles.chartCard,
                { backgroundColor: surface, borderColor: border, ...shadow },
              ]}
            >
              <View style={styles.chartHeader}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>
                    Engagement
                  </Text>
                  <Text style={[styles.chartSub, { color: colors.textSecondary }]}>
                    Last 7 days
                  </Text>
                </View>
                <View style={styles.chartLegend}>
                  {[
                    { c: '#ef4444', l: 'Likes' },
                    { c: '#3b82f6', l: 'Comments' },
                    { c: '#22c55e', l: 'Reposts' },
                  ].map((x) => (
                    <View key={x.l} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: x.c }]} />
                      <Text style={[styles.legendText, { color: colors.textMuted }]}>
                        {x.l}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.chartBody}>
                {stats.engagementByDay.map((day, i) => {
                  const likes = day.likes || 0;
                  const comments = day.comments || 0;
                  const reposts = day.reposts || 0;

                  const likesH = (likes / chartMax) * CHART_HEIGHT;
                  const commentsH = (comments / chartMax) * CHART_HEIGHT;
                  const repostsH = (reposts / chartMax) * CHART_HEIGHT;
                  const empty = repostsH === 0 && commentsH === 0 && likesH === 0;

                  return (
                    <View key={i} style={styles.barColumn}>
                      <View style={[styles.barStack, { height: CHART_HEIGHT }]}>
                        {repostsH > 0 && (
                          <View
                            style={[
                              styles.bar,
                              {
                                height: Math.max(repostsH, 2),
                                backgroundColor: '#22c55e',
                                borderTopLeftRadius: commentsH === 0 && likesH === 0 ? 6 : 0,
                                borderTopRightRadius: commentsH === 0 && likesH === 0 ? 6 : 0,
                              },
                            ]}
                          />
                        )}
                        {commentsH > 0 && (
                          <View
                            style={[
                              styles.bar,
                              {
                                height: Math.max(commentsH, 2),
                                backgroundColor: '#3b82f6',
                                borderTopLeftRadius: likesH === 0 ? 6 : 0,
                                borderTopRightRadius: likesH === 0 ? 6 : 0,
                              },
                            ]}
                          />
                        )}
                        {likesH > 0 && (
                          <View
                            style={[
                              styles.bar,
                              {
                                height: Math.max(likesH, 2),
                                backgroundColor: '#ef4444',
                                borderTopLeftRadius: 6,
                                borderTopRightRadius: 6,
                              },
                            ]}
                          />
                        )}
                        {empty && (
                          <View
                            style={[
                              styles.bar,
                              { height: 4, backgroundColor: colors.border, borderRadius: 2 },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={[styles.barLabel, { color: colors.textMuted }]}>
                        {dayLabel(day.date)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </FadeInUp>
        )}

        {/* ── Recent posts ── */}
        {stats.recentPosts?.length > 0 && (
          <FadeInUp delay={200}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                Recent Posts
              </Text>
              <View style={[styles.countPill, { backgroundColor: surfaceAlt }]}>
                <Text style={[styles.countPillText, { color: colors.textSecondary }]}>
                  {stats.recentPosts.length}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.listCard,
                { backgroundColor: surface, borderColor: border, ...shadow },
              ]}
            >
              {stats.recentPosts.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.recentPost,
                    idx !== stats.recentPosts.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: border,
                    },
                  ]}
                  onPress={() =>
                    (navigation.navigate as any)('PostDetail', { postId: String(p.id) })
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.recentPostText, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {p.text || '(no text)'}
                  </Text>
                  <View style={styles.recentPostStats}>
                    {[
                      { icon: 'heart', c: '#ef4444', v: p.likeCount },
                      { icon: 'message-circle', c: '#3b82f6', v: p.commentCount },
                      { icon: 'repeat', c: '#22c55e', v: p.repostCount },
                      { icon: 'eye', c: colors.textMuted, v: p.viewCount },
                    ].map((s, i) => (
                      <View key={i} style={styles.recentPostStat}>
                        <Feather name={s.icon as any} size={12} color={s.c} />
                        <Text
                          style={[
                            styles.recentPostStatText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {formatNumber(s.v)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </FadeInUp>
        )}

        {/* ── Top post ── */}
        {stats.topPost && (
          <FadeInUp delay={260}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                🏆 Top Post
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.topPost,
                { backgroundColor: surface, borderColor: border, ...shadow },
              ]}
              onPress={() =>
                (navigation.navigate as any)('PostDetail', {
                  postId: String(stats.topPost!.id),
                })
              }
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#f59e0b20', '#ef444420']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.topPostBadge}
              >
                <Feather name="award" size={14} color="#f59e0b" />
                <Text style={styles.topPostBadgeText}>Best performer</Text>
              </LinearGradient>

              <Text
                style={[styles.topPostText, { color: colors.text }]}
                numberOfLines={3}
              >
                {stats.topPost.text || '(no text)'}
              </Text>

              <View style={styles.topPostScore}>
                <View style={[styles.topPostScoreIcon, { backgroundColor: '#ef444420' }]}>
                  <Feather name="heart" size={14} color="#ef4444" />
                </View>
                <Text style={[styles.topPostScoreText, { color: colors.text }]}>
                  {formatNumber(stats.topPost.score)}
                </Text>
                <Text style={[styles.topPostScoreLabel, { color: colors.textSecondary }]}>
                  likes
                </Text>
              </View>
            </TouchableOpacity>
          </FadeInUp>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: { padding: 16, paddingBottom: 40 },

  /* Hero */
  hero: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  heroAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { color: 'white', fontSize: 18, fontWeight: '700' },
  heroName: { color: 'white', fontSize: 20, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { color: 'white', fontSize: 18, fontWeight: '800' },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  heroDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 4,
  },

  /* Section headers */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 12,
  },
  countPillText: { fontSize: 12, fontWeight: '700' },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
    marginBottom: 24,
  },
  statCard: {
    width: CARD_WIDTH,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '500' },

  /* Chart */
  chartCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 8,
  },
  chartSub: { fontSize: 12, marginTop: 2 },
  chartLegend: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '500' },

  chartBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 28,
  },
  barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barStack: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  bar: {
    width: '55%',
    marginBottom: 0,
  },
  barLabel: { fontSize: 10, marginTop: 8, fontWeight: '600' },

  /* Recent posts */
  listCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  recentPost: { padding: 16 },
  recentPostText: { fontSize: 14, lineHeight: 20 },
  recentPostStats: { flexDirection: 'row', gap: 16, marginTop: 10 },
  recentPostStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentPostStatText: { fontSize: 12, fontWeight: '600' },

  /* Top post */
  topPost: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  topPostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  topPostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f59e0b',
    letterSpacing: 0.2,
  },
  topPostText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  topPostScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  topPostScoreIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPostScoreText: { fontSize: 15, fontWeight: '800' },
  topPostScoreLabel: { fontSize: 13, fontWeight: '500' },

  /* Error */
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  errorSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: 'white', fontWeight: '600', fontSize: 15 },
});