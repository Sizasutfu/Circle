import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';
import { formatNumber } from '../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 140;

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

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

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

  // ── Compute the max value across the 7-day chart for bar scaling ──
  const chartMax = useMemo(() => {
    if (!stats?.engagementByDay?.length) return 1;
    const max = Math.max(
      ...stats.engagementByDay.map(
        (d) => (d.likes || 0) + (d.comments || 0) + (d.reposts || 0)
      )
    );
    return Math.max(1, max);
  }, [stats?.engagementByDay]);

  // ── Format a date like "Mon" or "Tue" ──
  const dayLabel = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
    } catch {
      return '';
    }
  };

  // ── Render a stat card ──
  const StatCard = ({
    icon,
    label,
    value,
    color,
  }: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    value: number;
    color: string;
  }) => (
    <View
      style={[
        styles.statCard,
        { backgroundColor: isDark ? '#1f2937' : '#f8f9fb' },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>
        {formatNumber(value || 0)}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  // ── Render the 7-day chart ──
  const renderChart = () => {
    if (!stats?.engagementByDay?.length) return null;

    return (
      <View
        style={[
          styles.chartCard,
          { backgroundColor: isDark ? '#1f2937' : '#f8f9fb' },
        ]}
      >
        <View style={styles.chartHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Engagement (last 7 days)
          </Text>
          <View style={styles.chartLegend}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Likes</Text>
            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Comments</Text>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Reposts</Text>
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

            const barWidth = (SCREEN_WIDTH - 64 - 40) / 7 - 10;

            return (
              <View key={i} style={styles.barColumn}>
                <View style={[styles.barStack, { height: CHART_HEIGHT }]}>
                  {/* Reposts (bottom, green) */}
                  {repostsH > 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: repostsH,
                          width: barWidth,
                          backgroundColor: '#22c55e',
                          borderTopLeftRadius: commentsH === 0 && likesH === 0 ? 4 : 0,
                          borderTopRightRadius: commentsH === 0 && likesH === 0 ? 4 : 0,
                        },
                      ]}
                    />
                  )}
                  {/* Comments (middle, blue) */}
                  {commentsH > 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: commentsH,
                          width: barWidth,
                          backgroundColor: '#3b82f6',
                          borderTopLeftRadius: likesH === 0 ? 4 : 0,
                          borderTopRightRadius: likesH === 0 ? 4 : 0,
                        },
                      ]}
                    />
                  )}
                  {/* Likes (top, red) */}
                  {likesH > 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: likesH,
                          width: barWidth,
                          backgroundColor: '#ef4444',
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                        },
                      ]}
                    />
                  )}
                  {/* Empty state — a faint placeholder bar */}
                  {repostsH === 0 && commentsH === 0 && likesH === 0 && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: 3,
                          width: barWidth,
                          backgroundColor: colors.border,
                          borderRadius: 2,
                        },
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
    );
  };

  // ── Render recent posts ──
  const renderRecentPosts = () => {
    const posts = stats?.recentPosts || [];
    if (!posts.length) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Recent Posts
        </Text>

        {posts.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.recentPost,
              { backgroundColor: isDark ? '#1f2937' : '#f8f9fb' },
            ]}
            onPress={() => (navigation.navigate as any)('PostDetail', { postId: String(p.id) })}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.recentPostText, { color: colors.text }]}
              numberOfLines={2}
            >
              {p.text || '(no text)'}
            </Text>
            <View style={styles.recentPostStats}>
              <View style={styles.recentPostStat}>
                <Feather name="heart" size={12} color="#ef4444" />
                <Text style={[styles.recentPostStatText, { color: colors.textSecondary }]}>
                  {formatNumber(p.likeCount)}
                </Text>
              </View>
              <View style={styles.recentPostStat}>
                <Feather name="message-circle" size={12} color="#3b82f6" />
                <Text style={[styles.recentPostStatText, { color: colors.textSecondary }]}>
                  {formatNumber(p.commentCount)}
                </Text>
              </View>
              <View style={styles.recentPostStat}>
                <Feather name="repeat" size={12} color="#22c55e" />
                <Text style={[styles.recentPostStatText, { color: colors.textSecondary }]}>
                  {formatNumber(p.repostCount)}
                </Text>
              </View>
              <View style={styles.recentPostStat}>
                <Feather name="eye" size={12} color={colors.textMuted} />
                <Text style={[styles.recentPostStatText, { color: colors.textSecondary }]}>
                  {formatNumber(p.viewCount)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ── Loading / error ──
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (isError || !stats) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => refetch()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Total engagement summary ──
  const totalEngagement =
    (stats.totalLikes || 0) + (stats.totalComments || 0) + (stats.totalReposts || 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Feather name="refresh-cw" size={20} color={colors.text} />
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
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={[styles.greetingName, { color: colors.text }]}>
            Hi, {user?.name?.split(' ')[0] || 'there'} 👋
          </Text>
          <Text style={[styles.greetingSub, { color: colors.textSecondary }]}>
            Here's how your Circle is doing
          </Text>
        </View>

        {/* Stat grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="file-text" label="Posts"     value={stats.postsCount}      color="#6C63FF" />
          <StatCard icon="users"     label="Followers" value={stats.followersCount}  color="#3b82f6" />
          <StatCard icon="user-plus" label="Following" value={stats.followingCount}  color="#8b5cf6" />
          <StatCard icon="heart"     label="Likes"     value={stats.totalLikes}      color="#ef4444" />
          <StatCard icon="message-circle" label="Comments" value={stats.totalComments} color="#3b82f6" />
          <StatCard icon="repeat"    label="Reposts"   value={stats.totalReposts}    color="#22c55e" />
          <StatCard icon="eye"       label="Views"     value={stats.totalViews}      color="#f59e0b" />
          <StatCard icon="play-circle" label="Video Views" value={stats.totalVideoViews} color="#ec4899" />
        </View>

        {/* Chart */}
        {renderChart()}

        {/* Total engagement highlight */}
        <View style={[styles.highlight, { backgroundColor: colors.primary }]}>
          <Feather name="trending-up" size={24} color="white" />
          <View style={styles.highlightText}>
            <Text style={styles.highlightValue}>{formatNumber(totalEngagement)}</Text>
            <Text style={styles.highlightLabel}>Total interactions</Text>
          </View>
        </View>

        {/* Recent posts */}
        {renderRecentPosts()}

        {/* Top post */}
        {stats.topPost && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              🏆 Top Performing Post
            </Text>
            <TouchableOpacity
              style={[
                styles.topPost,
                { backgroundColor: isDark ? '#1f2937' : '#f8f9fb' },
              ]}
              onPress={() =>
                (navigation.navigate as any)('PostDetail', { postId: String(stats.topPost!.id) })
              }
              activeOpacity={0.7}
            >
              <Text style={[styles.topPostText, { color: colors.text }]} numberOfLines={3}>
                {stats.topPost.text || '(no text)'}
              </Text>
              <View style={styles.topPostScore}>
                <Feather name="heart" size={14} color="#ef4444" />
                <Text style={[styles.topPostScoreText, { color: colors.text }]}>
                  {formatNumber(stats.topPost.score)} likes
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Greeting
  greeting: { marginBottom: 20 },
  greetingName: { fontSize: 24, fontWeight: '700' },
  greetingSub: { fontSize: 14, marginTop: 4 },

  // Stat grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2 - 5,
    padding: 14,
    borderRadius: 14,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '500' },

  // Chart
  chartCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
  },
  chartHeader: { marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, marginRight: 10 },
  chartBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 30,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barStack: {
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: { marginBottom: 0 },
  barLabel: { fontSize: 10, marginTop: 6, fontWeight: '500' },

  // Highlight
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 14,
    marginBottom: 20,
  },
  highlightText: {},
  highlightValue: { color: 'white', fontSize: 24, fontWeight: '700' },
  highlightLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  // Recent posts
  section: { marginBottom: 20 },
  recentPost: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  recentPostText: { fontSize: 14, lineHeight: 20 },
  recentPostStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  recentPostStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentPostStatText: { fontSize: 12, fontWeight: '600' },

  // Top post
  topPost: {
    padding: 16,
    borderRadius: 12,
  },
  topPostText: { fontSize: 14, lineHeight: 20 },
  topPostScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  topPostScoreText: { fontSize: 13, fontWeight: '600' },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: 'white', fontWeight: '600', fontSize: 16 },
});