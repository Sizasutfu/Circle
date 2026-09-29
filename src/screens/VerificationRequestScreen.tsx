import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

const CATEGORIES = [
  { id: 'creator',     label: 'Creator',     hint: 'Content creator, influencer, artist' },
  { id: 'journalist',  label: 'Journalist',  hint: 'Reporter, editor, media' },
  { id: 'business',    label: 'Business',    hint: 'Brand, company, organisation' },
  { id: 'sports',      label: 'Sports',      hint: 'Athlete, team, coach' },
  { id: 'music',       label: 'Music',       hint: 'Musician, band, label' },
  { id: 'actor',       label: 'Actor',       hint: 'Actor, director, producer' },
  { id: 'government',  label: 'Government',  hint: 'Official, public figure' },
  { id: 'other',       label: 'Other',       hint: 'Something else' },
];

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface VerificationRequest {
  id: number;
  fullName: string;
  category: string;
  reason: string;
  links?: string | null;
  email?: string | null;
  status: RequestStatus;
  adminNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export default function VerificationRequestScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(user?.name || '');
  const [category, setCategory] = useState<string>('');
  const [reason, setReason] = useState('');
  const [links, setLinks] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['verification-status', user?.id],
    queryFn: async () => {
      const res = await api.get('/verification/status');
      const body = res.data?.data ?? res.data ?? {};
      return (body.request || null) as VerificationRequest | null;
    },
    enabled: !!user,
  });

  const request = data;

  const handleSubmit = useCallback(async () => {
    const trimmedFullName = fullName.trim();
    const trimmedReason = reason.trim();

    if (!trimmedFullName) {
      Alert.alert('Missing name', 'Please enter your full name.');
      return;
    }
    if (!category) {
      Alert.alert('Missing category', 'Please choose a category.');
      return;
    }
    if (trimmedReason.length < 50) {
      Alert.alert(
        'Reason too short',
        `Please give at least 50 characters so we understand why you should be verified. (Currently ${trimmedReason.length}.)`
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/verification/request', {
        fullName: trimmedFullName,
        category,
        reason: trimmedReason,
        links: links.trim() || null,
        email: email.trim() || null,
      });

      await refetch();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Request submitted', 'We\'ll review your request and get back to you within 5–7 days.');
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Could not submit your request. Please try again.';
      if (status === 409) {
        await refetch();
      }
      Alert.alert('Error', String(msg));
    } finally {
      setSubmitting(false);
    }
  }, [fullName, category, reason, links, email, refetch, queryClient]);

  // ── Loading ──
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ── Approved ──
  if (request?.status === 'approved') {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <Header title="Verification" colors={colors} navigation={navigation} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statusIcon, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <Feather name="check-circle" size={36} color="#22c55e" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              You're verified
            </Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              Your account carries the verification badge. Thanks for being part of Circle.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => (navigation.navigate as any)('MyProfile')}
            >
              <Text style={styles.primaryBtnText}>View my profile</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Pending ──
  if (request?.status === 'pending') {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <Header title="Verification" colors={colors} navigation={navigation} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.statusIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
              <Feather name="clock" size={34} color="#f59e0b" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              Request under review
            </Text>
            <Text style={[styles.statusBody, { color: colors.textSecondary }]}>
              We received your verification request and our team is reviewing it. You'll get a
              notification when there's an update.
            </Text>

            <View style={[styles.summaryBox, { borderColor: colors.border }]}>
              <SummaryRow label="Full name"  value={request.fullName} colors={colors} />
              <SummaryRow label="Category"   value={labelForCategory(request.category)} colors={colors} />
              <SummaryRow
                label="Submitted"
                value={new Date(request.createdAt).toLocaleDateString()}
                colors={colors}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Rejected (or never requested) — show form ──
  const wasRejected = request?.status === 'rejected';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <Header title="Verification" colors={colors} navigation={navigation} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {wasRejected ? (
            <View
              style={[
                styles.rejectedBox,
                {
                  backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                  borderColor: 'rgba(239,68,68,0.3)',
                },
              ]}
            >
              <Feather name="alert-circle" size={20} color="#ef4444" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.rejectedTitle, { color: colors.text }]}>
                  Previous request not approved
                </Text>
                {request?.adminNote ? (
                  <Text style={[styles.rejectedNote, { color: colors.textSecondary }]}>
                    {request.adminNote}
                  </Text>
                ) : (
                  <Text style={[styles.rejectedNote, { color: colors.textSecondary }]}>
                    You can submit a new request with more detail.
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          {/* Intro */}
          <View style={[styles.introCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.introIcon, { backgroundColor: isDark ? '#374151' : '#eff6ff' }]}>
              <Feather name="shield" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.introTitle, { color: colors.text }]}>
              Request verification
            </Text>
            <Text style={[styles.introBody, { color: colors.textSecondary }]}>
              Verification confirms that an account of public interest is authentic. Fill out
              the form below and our team will review your request.
            </Text>
          </View>

          {/* Form */}
          <Field label="Full name" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your legal or public name"
              placeholderTextColor={colors.placeholder}
              editable={!submitting}
            />
          </Field>

          <Field label="Category" colors={colors}>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    activeOpacity={0.8}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: active ? '#fff' : colors.text },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {category ? (
              <Text style={[styles.categoryHint, { color: colors.textMuted }]}>
                {CATEGORIES.find((c) => c.id === category)?.hint}
              </Text>
            ) : null}
          </Field>

          <Field label="Why should you be verified?" colors={colors}>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={reason}
              onChangeText={setReason}
              placeholder="Tell us about yourself, your work, and why your account is notable. Minimum 50 characters."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={6}
              maxLength={1000}
              editable={!submitting}
            />
            <Text
              style={[
                styles.charCount,
                { color: reason.length >= 50 ? colors.textMuted : '#f59e0b' },
              ]}
            >
              {reason.length} / 1000
            </Text>
          </Field>

          <Field label="Links (optional)" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={links}
              onChangeText={setLinks}
              placeholder="Website, press, social media — one per line"
              placeholderTextColor={colors.placeholder}
              multiline
              editable={!submitting}
            />
          </Field>

          <Field label="Contact email" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!submitting}
            />
          </Field>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary, marginTop: 8 },
              submitting && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {wasRejected ? 'Submit new request' : 'Submit request'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Submitting false information may result in your account being suspended. We review
            every request manually.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Small helpers ────────────────────────────────────────────

function labelForCategory(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}

function Header({ title, colors, navigation }: any) {
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Feather name="arrow-left" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function Field({ label, colors, children }: any) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value, colors }: any) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 48 },

  introCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 20,
  },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  introTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  introBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  rejectedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  rejectedTitle: { fontSize: 14, fontWeight: '700' },
  rejectedNote: { fontSize: 13, marginTop: 2, lineHeight: 18 },

  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  charCount: { fontSize: 11, marginTop: 6, textAlign: 'right' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  categoryHint: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },

  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  footnote: { fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },

  // Status cards
  statusCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  statusBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  summaryBox: {
    alignSelf: 'stretch',
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  summaryLabel: { fontSize: 12, width: 90, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { flex: 1, fontSize: 14 },
});