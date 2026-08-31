import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../api/client';

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Change password mutation ──
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await api.put(`/users/${user?.id}/password`, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      Alert.alert(
        'Success',
        'Your password has been changed successfully.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to change password. Please try again.';
      Alert.alert('Error', message);
    },
  });

  // ── Validate and submit ──
  const handleSubmit = () => {
    // Validate current password
    if (!currentPassword.trim()) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }

    // Validate new password
    if (!newPassword.trim()) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }

    // Validate confirm password
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    // Check if new password is same as current
    if (newPassword === currentPassword) {
      Alert.alert('Error', 'New password must be different from your current password.');
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: currentPassword.trim(),
      newPassword: newPassword.trim(),
    });
  };

  const isLoading = changePasswordMutation.isPending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        {/* ─── Header ─── */}
        <View style={[styles.header, { 
          backgroundColor: colors.surface, 
          borderBottomColor: colors.border 
        }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={isLoading}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Change Password</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.infoContainer}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#374151' : '#f0f4ff' }]}>
              <Feather name="lock" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Change Your Password</Text>
            <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>
              For your security, please enter your current password and then create a new one.
            </Text>
          </View>

          {/* ─── Current Password ─── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Current Password</Text>
            <View style={[styles.inputContainer, { 
              backgroundColor: colors.input, 
              borderColor: colors.inputBorder 
            }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showCurrentPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                style={styles.eyeButton}
              >
                <Feather
                  name={showCurrentPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── New Password ─── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>New Password</Text>
            <View style={[styles.inputContainer, { 
              backgroundColor: colors.input, 
              borderColor: colors.inputBorder 
            }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showNewPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                style={styles.eyeButton}
              >
                <Feather
                  name={showNewPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Must be at least 6 characters.</Text>
          </View>

          {/* ─── Confirm Password ─── */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>Confirm New Password</Text>
            <View style={[styles.inputContainer, { 
              backgroundColor: colors.input, 
              borderColor: colors.inputBorder 
            }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showConfirmPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
              >
                <Feather
                  name={showConfirmPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ─── Password Requirements ─── */}
          <View style={[styles.requirementsContainer, { 
            backgroundColor: isDark ? '#1f2937' : '#f9fafb',
            borderColor: colors.border 
          }]}>
            <Text style={[styles.requirementsTitle, { color: colors.text }]}>Password must:</Text>
            <View style={styles.requirementItem}>
              <Feather
                name={newPassword.length >= 6 ? 'check-circle' : 'circle'}
                size={16}
                color={newPassword.length >= 6 ? '#22c55e' : colors.textMuted}
              />
              <Text style={[styles.requirementText, { color: colors.textSecondary }, newPassword.length >= 6 && styles.requirementMet]}>
                Be at least 6 characters long
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Feather
                name={newPassword !== currentPassword && newPassword.length > 0 ? 'check-circle' : 'circle'}
                size={16}
                color={newPassword !== currentPassword && newPassword.length > 0 ? '#22c55e' : colors.textMuted}
              />
              <Text style={[styles.requirementText, { color: colors.textSecondary }, newPassword !== currentPassword && newPassword.length > 0 && styles.requirementMet]}>
                Be different from your current password
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Feather
                name={newPassword === confirmPassword && confirmPassword.length > 0 ? 'check-circle' : 'circle'}
                size={16}
                color={newPassword === confirmPassword && confirmPassword.length > 0 ? '#22c55e' : colors.textMuted}
              />
              <Text style={[styles.requirementText, { color: colors.textSecondary }, newPassword === confirmPassword && confirmPassword.length > 0 && styles.requirementMet]}>
                Passwords match
              </Text>
            </View>
          </View>

          {/* ─── Submit Button ─── */}
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  infoSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  eyeButton: {
    padding: 10,
  },
  helperText: {
    fontSize: 12,
    marginTop: 4,
  },
  requirementsContainer: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  requirementText: {
    fontSize: 14,
    marginLeft: 8,
  },
  requirementMet: {
    color: '#22c55e',
  },
  submitButton: {
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});