// src/screens/EmailVerificationScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function EmailVerificationScreen() {
  const { user, updateUser, logout } = useAuth();
  const { colors, isDark } = useTheme();

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Prevents double-submit while an auto-submit is already in flight
  const submitLockRef = useRef(false);

  // Focus the hidden input on mount so the keyboard is ready
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  // Clean up the cooldown timer on unmount
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

  const verifyCode = useCallback(
    async (submitted: string) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setIsVerifying(true);
      setError(null);

      try {
        const res = await api.post('/users/email/verify', {
          userId: user?.id,
          code: submitted,
        });

        // Backend may return the fresh user, or just a success flag.
        const payload = res.data?.data ?? res.data;
        const updatedUser = payload?.user ?? payload;

        if (updatedUser && (updatedUser.id || updatedUser.email)) {
          updateUser({
            ...updatedUser,
            // Ensure the flag is set even if the API is inconsistent
            emailVerified: true,
            email_verified: true,
          });
        } else if (user) {
          updateUser({ ...user, emailVerified: true, email_verified: true });
        }
        // AppNavigator will unmount this screen on the next render
      } catch (err: any) {
        const status = err?.response?.status;
        const message =
          err?.response?.data?.message ||
          (status === 400
            ? "That code isn't right. Double-check and try again."
            : 'Something went wrong. Please try again.');

        setError(message);
        setCode('');
        // Refocus so the user can retype immediately
        setTimeout(() => inputRef.current?.focus(), 100);
      } finally {
        setIsVerifying(false);
        submitLockRef.current = false;
      }
    },
    [user, updateUser]
  );

  const handleChangeText = useCallback(
    (text: string) => {
      // Keep only digits
      const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
      setCode(digits);
      if (error) setError(null);

      // Auto-submit once the code reaches full length
      if (digits.length === CODE_LENGTH) {
        verifyCode(digits);
      }
    },
    [error, verifyCode]
  );

  const handleSubmit = useCallback(() => {
    if (code.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`);
      return;
    }
    verifyCode(code);
  }, [code, verifyCode]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    try {
      await api.post('/users/email/send-verification', {
        userId: user?.id,
        email: user?.email,
      });
      startCooldown();
      setCode('');
      Alert.alert('Code sent', `We sent a fresh code to ${user?.email || 'your inbox'}.`);
      setTimeout(() => inputRef.current?.focus(), 200);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        Alert.alert('Slow down', 'Please wait a moment before requesting another code.');
        startCooldown();
      } else {
        Alert.alert(
          'Could not send code',
          err?.response?.data?.message || 'Please try again in a moment.'
        );
      }
    } finally {
      setIsResending(false);
    }
  }, [resendCooldown, isResending, startCooldown, user?.id, user?.email]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log out?', 'You can sign back in once your email is verified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  // ── Digit boxes ──
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const focusedIndex = Math.min(code.length, CODE_LENGTH - 1);

  const resendLabel =
    resendCooldown > 0
      ? `Resend in ${resendCooldown}s`
      : isResending
      ? 'Sending…'
      : 'Resend code';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.body} onPress={() => inputRef.current?.focus()}>
          {/* Icon */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isDark ? '#1f2937' : '#eef2ff' },
            ]}
          >
            <Feather name="shield" size={40} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Enter verification code
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a {CODE_LENGTH}-digit code to
          </Text>
          <Text style={[styles.email, { color: colors.text }]} numberOfLines={1}>
            {user?.email || 'your email address'}
          </Text>

          {/* ── Code boxes (tap anywhere to focus the hidden input) ── */}
          <View style={styles.codeRow}>
            {digits.map((digit, i) => {
              const isFocused = i === focusedIndex && !isVerifying;
              const hasError = !!error;
              const borderColor = hasError
                ? '#ef4444'
                : isFocused
                ? colors.primary
                : colors.border;
              return (
                <View
                  key={i}
                  style={[
                    styles.codeBox,
                    {
                      backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                      borderColor,
                    },
                    isFocused && styles.codeBoxFocused,
                  ]}
                >
                  <Text style={[styles.codeDigit, { color: colors.text }]}>
                    {digit}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Hidden input that actually holds the value */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleChangeText}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            style={styles.hiddenInput}
            editable={!isVerifying}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {/* Error / helper line */}
          <View style={styles.helperRow}>
            {error ? (
              <Text style={[styles.errorText, { color: '#ef4444' }]}>
                {error}
              </Text>
            ) : (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Didn't get it? Check your spam folder.
              </Text>
            )}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              (code.length !== CODE_LENGTH || isVerifying) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={code.length !== CODE_LENGTH || isVerifying}
            activeOpacity={0.85}
          >
            {isVerifying ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Feather name="check-circle" size={18} color="white" />
                <Text style={styles.primaryText}>Verify</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Resend with cooldown */}
          <TouchableOpacity
            style={styles.checkButton}
            onPress={handleResend}
            disabled={resendCooldown > 0 || isResending}
            activeOpacity={0.7}
          >
            {isResending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather
                  name="refresh-cw"
                  size={14}
                  color={resendCooldown > 0 ? colors.textMuted : colors.primary}
                />
                <Text
                  style={[
                    styles.checkText,
                    { color: resendCooldown > 0 ? colors.textMuted : colors.primary },
                  ]}
                >
                  {resendLabel}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Pressable>

        {/* Footer: log out escape hatch */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: colors.textMuted }]}>
            Use a different account
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
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

  // ── Code boxes ──
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 32,
    marginBottom: 8,
  },
  codeBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFocused: {
    // Slightly thicker stroke while this box is the active one
    borderWidth: 2,
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Invisible input laid over the boxes to receive keystrokes + paste
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  helperRow: {
    minHeight: 20,
    marginTop: 4,
    marginBottom: 20,
    alignItems: 'center',
  },
  helperText: { fontSize: 13, textAlign: 'center' },
  errorText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  primaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.5 },

  checkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 36,
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