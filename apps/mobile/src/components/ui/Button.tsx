import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { layout, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  /** Secondary line under the label (e.g. "Configure sensor, threshold & notification"). */
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  compact?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon, trailingIcon, subtitle, style, disabled, compact }: Props) {
  const { colors } = useTheme();
  const filled = variant === 'primary' || variant === 'accent';
  const fg = filled
    ? colors.onPrimaryFill
    : variant === 'outline'
      ? colors.primary
      : variant === 'ghost'
        ? colors.primary
        : colors.textStrong;

  const surface: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong }
      : variant === 'outline'
        ? { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primaryBorder }
        : {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { minHeight: compact ? 40 : subtitle ? 60 : layout.buttonHeight, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        surface,
        style,
      ]}>
      {filled && (
        <LinearGradient
          colors={variant === 'accent' ? colors.gradientAccent : colors.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
        />
      )}
      <View style={styles.row}>
        {icon && <Icon name={icon} size={20} color={fg} />}
        <AppText variant="labelLg" tint={fg} numberOfLines={1}>
          {label}
        </AppText>
        {trailingIcon && <Icon name={trailingIcon} size={18} color={fg} />}
      </View>
      {subtitle && (
        <AppText variant="bodySm" tint={fg} style={{ opacity: 0.85, marginTop: 2 }}>
          {subtitle}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
