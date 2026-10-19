import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

import { Screen } from './Screen';
import { StackHeader } from './StackHeader';

/** Route stub for screens not yet designed in Stitch. */
export function Placeholder({ title, icon, message, children }: { title: string; icon: IconName; message: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Screen header={<StackHeader backLabel="Back" title={title} />}>
      {children}
      <Card style={styles.card}>
        <Icon name={icon} size={32} color={colors.textMuted} />
        <AppText variant="headlineSm" color="textStrong">
          {title}
        </AppText>
        <AppText variant="bodyMd" color="textMuted" align="center">
          {message}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
