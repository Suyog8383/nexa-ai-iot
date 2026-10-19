import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  /** Inline count pill, e.g. "2 of 2 On". */
  count?: string;
  action?: { label: string; onPress?: () => void; icon?: IconName };
  /** Static right-aligned caption, e.g. "Past 7 Days". */
  caption?: string;
  uppercase?: boolean;
};

export function SectionHeader({ title, count, action, caption, uppercase }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <AppText variant={uppercase ? 'labelSm' : 'labelLg'} color={uppercase ? 'textMuted' : 'textStrong'} uppercase={uppercase}>
          {title}
        </AppText>
        {count && (
          <View style={[styles.count, { backgroundColor: colors.primaryTint, borderColor: colors.primaryBorder }]}>
            <AppText variant="labelSm" tint={colors.primary}>
              {count}
            </AppText>
          </View>
        )}
      </View>
      {action && (
        <Pressable hitSlop={8} onPress={action.onPress} style={styles.action}>
          {action.icon && <Icon name={action.icon} size={14} color={colors.secondary} />}
          <AppText variant="labelSm" tint={action.icon ? colors.secondary : colors.primary}>
            {action.label}
          </AppText>
        </Pressable>
      )}
      {caption && (
        <AppText variant="labelSm" color="textMuted">
          {caption}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
