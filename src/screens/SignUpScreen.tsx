import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  BackHandler,
  Keyboard,
  Animated,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const TOTAL_STEPS = 5;

// Define the shape of a single step
type Step = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  placeholder: string;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
  helper: string | null;
  isPassword: boolean;
};

export default function SignUpScreen() {
  const navigation = useNavigation();
  const { register } = useAuth();
  const { colors } = useTheme();

  // Field values
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Wizard state
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const steps: Step[] = [
    {
      key: 'name',
      label: 'Full Name',
      icon: 'user',
      placeholder: 'John Doe',
      value: name,
      setValue: setName,
      autoCapitalize: 'words',
      keyboardType: 'default',
      helper: null,
      isPassword: false,
    },
    {
      key: 'username',
      label: 'Username',
      icon: 'at-sign',
      placeholder: 'johndoe',
      value: username,
      setValue: setUsername,
      autoCapitalize: 'none',
      keyboardType: 'default',
      helper: 'Letters, numbers, and underscores only.',
      isPassword: false,
    },
    {
      key: 'email',
      label: 'Email',
      icon: 'mail',
      placeholder: 'you@example.com',
      value: email,
      setValue: setEmail,
      autoCapitalize: 'none',
      keyboardType: 'email-address',
      helper: null,
      isPassword: false,
    },
    {
      key: 'password',
      label: 'Password',
      icon: 'lock',
      placeholder: '••••••••',
      value: password,
      setValue: setPassword,
      autoCapitalize: 'none',
      keyboardType: 'default',
      helper: 'Must be at least 8 characters.',
      isPassword: true,
    },
    {
      key: 'confirmPassword',
      label: 'Confirm Password',
      icon: 'lock',
      placeholder: '••••••••',
      value: confirmPassword,
      setValue: setConfirmPassword,
      autoCapitalize: 'none',
      keyboardType: 'default',
      helper: null,
      isPassword: true,
    },
  ];

  const current = steps[step];
  const isLastStep = step === TOTAL_STEPS - 1;

  /* ------------------------------------------------------------------ */
  /* Validation                                                          */
  /* ------------------------------------------------------------------ */
  const validateStep = (index: number): string | null => {
    switch (index) {
      case 0:
        if (!name.trim()) return 'Please enter your full name.';
        return null;

      case 1: {
        const value = username.trim();
        if (!value) return 'Please choose a username.';
        if (value.length < 3) return 'Username must be at least 3 characters.';
        if (!/^[a-zA-Z0-9_]+$/.test(value))
          return 'Username can only contain letters, numbers, and underscores.';
        return null;
      }

      case 2: {
        const value = email.trim();
        if (!value) return 'Please enter your email address.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          return 'Please enter a valid email address.';
        return null;
      }

      case 3:
        if (!password) return 'Please create a password.';
        if (password.length < 8) return 'Password must be at least 8 characters.';
        return null;

      case 4:
        if (!confirmPassword) return 'Please confirm your password.';
        if (confirmPassword !== password) return 'Passwords do not match.';
        return null;

      default:
        return null;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Navigation between steps                                            */
  /* ------------------------------------------------------------------ */
  const handleNext = () => {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (loading) return;
    if (step > 0) {
      setError(null);
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handlePrimaryAction = () => {
    if (isLastStep) {
      handleSignUp();
    } else {
      handleNext();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Submit                                                              */
  /* ------------------------------------------------------------------ */
  const handleSignUp = async () => {
    // Safety net: re-validate every step (handles "back then forward" edits)
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const message = validateStep(i);
      if (message) {
        setStep(i);
        setError(message);
        return;
      }
    }

    setError(null);
    Keyboard.dismiss();
    setLoading(true);

    try {
      await register({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message || 'Registration failed. Please try again.';
      Alert.alert('Sign Up Failed', message);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  // Animate + reset per-step UI state whenever the step changes
  useEffect(() => {
    setShowPassword(false);
    setError(null);

    fadeAnim.setValue(0);
    slideAnim.setValue(16);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Android hardware back goes to the previous step instead of leaving the screen
  useEffect(() => {
    const onBackPress = () => {
      if (step > 0) {
        setError(null);
        setStep(step - 1);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [step]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            disabled={loading}
          >
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressRow}>
            {steps.map((s, i) => (
              <View
                key={s.key}
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor:
                      i <= step ? colors.primary : colors.inputBorder,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.stepText, { color: colors.textMuted }]}>
            Step {step + 1} of {TOTAL_STEPS}
          </Text>

          <View style={styles.headerContainer}>
            <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Join the Circle community and start connecting.
            </Text>
          </View>

          <View style={styles.formContainer}>
            {/* Current step input */}
            <Animated.View
              key={current.key}
              style={{
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              }}
            >
              <View style={styles.inputWrapper}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {current.label}
                </Text>

                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: colors.input,
                      borderColor: error
                        ? '#EF4444'
                        : focused
                        ? colors.primary
                        : colors.inputBorder,
                    },
                  ]}
                >
                  <Feather
                    name={current.icon}
                    size={20}
                    color={colors.textMuted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={current.placeholder}
                    placeholderTextColor={colors.placeholder}
                    value={current.value}
                    onChangeText={(text) => {
                      current.setValue(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    autoFocus
                    autoCapitalize={current.autoCapitalize}
                    autoCorrect={false}
                    keyboardType={current.keyboardType}
                    secureTextEntry={current.isPassword && !showPassword}
                    editable={!loading}
                    returnKeyType={isLastStep ? 'done' : 'next'}
                    onSubmitEditing={handlePrimaryAction}
                    blurOnSubmit={false}
                  />
                  {current.isPassword && (
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.eyeButton}
                    >
                      <Feather
                        name={showPassword ? 'eye' : 'eye-off'}
                        size={20}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : current.helper ? (
                  <Text style={[styles.helperText, { color: colors.textMuted }]}>
                    {current.helper}
                  </Text>
                ) : null}
              </View>
            </Animated.View>

            {/* Primary action: Next → Create Account */}
            <TouchableOpacity
              style={[
                styles.signUpButton,
                { backgroundColor: colors.primary },
                loading && styles.signUpButtonDisabled,
              ]}
              onPress={handlePrimaryAction}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.signUpButtonText}>
                  {isLastStep ? 'Create Account' : 'Next'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Terms — only on the final step */}
            {isLastStep && (
              <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                By signing up, you agree to our{' '}
                <Text style={[styles.termsLink, { color: colors.primary }]}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text style={[styles.termsLink, { color: colors.primary }]}>
                  Privacy Policy
                </Text>
                .
              </Text>
            )}

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={[styles.loginLinkText, { color: colors.textSecondary }]}>
                Already have an account?{' '}
                <Text style={[styles.loginLinkHighlight, { color: colors.primary }]}>
                  Log In
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  backButton: {
    paddingTop: 12,
    paddingBottom: 8,
    alignSelf: 'flex-start',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  headerContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  formContainer: {
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    height: 52,
  },
  inputFocused: {
    borderColor: '#6C63FF',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  eyeButton: {
    padding: 4,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    color: '#EF4444',
  },
  signUpButton: {
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signUpButtonDisabled: {
    opacity: 0.7,
  },
  signUpButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  termsText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
  },
  termsLink: {
    fontWeight: '500',
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 16,
  },
  loginLinkHighlight: {
    fontWeight: '600',
  },
});