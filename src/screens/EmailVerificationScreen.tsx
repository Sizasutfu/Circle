// src/screens/EmailVerificationScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

const POLL_INTERVAL_MS = 5000;
const RESEND_COOLDOWN_S = 60;

function extractEmailVerified(u: any): boolean | undefined {
  if (!u) return undefined;
  const raw =
    u.emailVerified ??
    u.email_verified ??
    u.isEmailVerified ??
    u.is_email_verified ??
    u.verifiedEmail;
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === 0 || raw === '0' || raw === 'false') return false;
  return undefined;
}

export default function EmailVerificationScreen() {
  const { user, updateUser, logout } = useAuth();
  const { colors, isDark } = useTheme();

  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll /auth/me for the verified flag flipping ──
  const { data: freshUser, refetch: checkVerification, isFetching } = useQuery({
    queryKey: ['auth', 'me', user?.id],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data?.data ?? res.data;
    },
    enabled: !!user?.id,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!freshUser) return;
    if (extractEmailVerified(freshUser) === true) {
      // The AppNavigator will swap away the moment this lands
      updateUser(freshUser);
    }
  }, [freshUser, updateUser]);

  // ── Refetch immediately when the app returns to the foreground ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        checkVerification();
      }
    });
    return () => sub.remove();
  }, [checkVerification]);

  // ── Clean up the cooldown timer ──
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await api.post('/auth/resend-verification');
      startCooldown();
      Alert.alert(
        'Email sent',
        `We sent a fresh verification link to ${user?.email || 'your inbox'}.`
      );
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        Alert.alert('Slow down', 'Please wait a moment before requesting another email.');
        startCooldown();
      } else {
        Alert.alert(
          'Could not send email',
          err?.response?.data?.message || 'Please try again in a moment.'
        );
      }
    } finally {
      setIsResending(false);
    }
  }, [resendCooldown, isResending, startCooldown, user?.email]);

  const handleCheckNow = useCallback(async () => {
    await checkVerification();
  }, [checkVerification]);

  const openMailApp = useCallback(async () => {
    const candidates = Platform.select<string[]>({
      ios: ['message://', 'googlegmail://', 'ms-outlook://', 'ymail://'],
      android: ['googlegmail://', 'ms-outlook://', 'ymail://'],
      default: [],
    }) || [];

    for (const url of candidates) {
      try {
        const can = await Linking.canOpenURL(url);
        if (can) {
          await Linking.openURL(url);
          return;
        }
      } catch {
        // try the next candidate
      }
    }

    Alert.alert(
      'Open your email app',
      'We sent a link to the email on your account. Open your inbox and tap it to verify.'
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out?', 'You can sign back in once your email is verified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  const resendLabel =
    resendCooldown > 0
      ? `Resend in ${resendCooldown}s`
      : isResending
      ? 'Sending…'
      : 'Resend email';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.body}>
        {/* Icon */}
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isDark ? '#1f2937' : '#eef2ff' },
          ]}
        >
          <Feather name="mail" size={40} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          Verify your email
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          We sent a verification link to
        </Text>
        <Text style={[styles.email, { color: colors.text }]} numberOfLines={1}>
          {user?.email || 'your email address'}
        </Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Tap the link in the email to activate your account. Don't see it?
          Check your spam folder.
        </Text>

        {/* Primary: open mail app */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={openMailApp}
          activeOpacity={0.85}
        >
          <Feather name="external-link" size={18} color="white" />
          <Text style={styles.primaryText}>Open email app</Text>
        </TouchableOpacity>

        {/* Resend with cooldown */}
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            { backgroundColor: isDark ? '#374151' : '#f3f4f6' },
            (resendCooldown > 0 || isResending) && styles.buttonDisabled,
          ]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || isResending}
          activeOpacity={0.85}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Feather name="refresh-cw" size={16} color={colors.text} />
          )}
          <Text style={[styles.secondaryText, { color: colors.text }]}>
            {resendLabel}
          </Text>
        </TouchableOpacity>

        {/* Check now — manual refetch */}
        <TouchableOpacity
          style={styles.checkButton}
          onPress={handleCheckNow}
          disabled={isFetching}
          activeOpacity={0.7}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Feather name="check-circle" size={14} color={colors.primary} />
              <Text style={[styles.checkText, { color: colors.primary }]}>
                I've verified — check now
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer: log out escape hatch */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={[styles.logoutText, { color: colors.textMuted }]}>
          Use a different account
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  email: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
    maxWidth: '100%',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 19,
    paddingHorizontal: 8,
  },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    marginTop: 32,
  },
  primaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },

  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    marginTop: 12,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: { opacity: 0.55 },

  checkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  checkText: {
    fontSize: 14,
    fontWeight: '600',
  },

  logoutButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '500',
  },
});