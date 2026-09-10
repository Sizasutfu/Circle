import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface Action {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: Action[];
}

export default function MessageActionSheet({ visible, onClose, title, actions }: Props) {
  const { colors, isDark } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: isDark ? 'transparent' : '#000',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {title && (
            <Text
              style={[styles.title, { color: colors.textMuted, borderBottomColor: colors.border }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}

          {actions.map((action, i) => {
            const tint = action.destructive ? '#ef4444' : colors.text;
            const iconColor = action.destructive ? '#ef4444' : colors.primary;
            const isLast = i === actions.length - 1;

            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.actionRow,
                  !isLast && { borderBottomColor: colors.border, borderBottomWidth: 1 },
                ]}
                onPress={() => {
                  onClose();
                  // slight delay so the modal closes before the handler runs
                  setTimeout(action.onPress, 80);
                }}
                activeOpacity={0.6}
              >
                {action.icon && (
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        backgroundColor: action.destructive
                          ? isDark
                            ? 'rgba(239,68,68,0.15)'
                            : 'rgba(239,68,68,0.08)'
                          : isDark
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(0,0,0,0.03)',
                      },
                    ]}
                  >
                    <Feather name={action.icon} size={18} color={iconColor} />
                  </View>
                )}
                <Text style={[styles.actionLabel, { color: tint }]}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </Pressable>

        {/* Cancel button sits separately, iOS-style */}
        <Pressable
          style={[styles.cancelButton, { backgroundColor: colors.surface }]}
          onPress={onClose}
        >
          <Text style={[styles.cancelLabel, { color: colors.text }]}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});