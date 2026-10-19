import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  backLabel: string;
  title: string;
  /**
   * `inline`: "‹ Devices | Device Details" (Device Details).
   * `centered`: "‹ Alerts   New Alert Rule   Cancel" (Create Alert Rule).
   */
  layout?: 'inline' | 'centered';
  right?: ReactNode;
};

export function StackHeader({ backLabel, title, layout = 'inline', right }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${backLabel}`} hitSlop={8} onPress={() => router.back()} style={styles.back}>
      <Icon name="arrow_back_ios" size={18} color={layout === 'centered' ? colors.primary : colors.text} />
      <AppText variant={layout === 'centered' ? 'bodyLg' : 'labelLg'} tint={layout === 'centered' ? colors.primary : colors.textMuted}>
        {backLabel}
      </AppText>
    </Pressable>
  );

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      {layout === 'inline' ? (
        <>
          {back}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <AppText variant="headlineSm" color="textStrong" style={styles.flex} numberOfLines={1}>
            {title}
          </AppText>
          {right}
        </>
      ) : (
        <>
          <View style={styles.side}>{back}</View>
          <AppText variant="headlineSm" color="textStrong" align="center" style={styles.flex} numberOfLines={1}>
            {title}
          </AppText>
          <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  divider: { width: 1, height: 18, marginHorizontal: spacing.xs },
  flex: { flex: 1 },
  side: { width: 84 },
});
