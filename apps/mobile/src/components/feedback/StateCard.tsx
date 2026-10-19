import { ActivityIndicator, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

type Props = {
  title: string;
  message?: string;
  /** Shown above the title. Ignored while `loading`. */
  icon?: IconName;
  tone?: 'muted' | 'danger';
  /** Replaces the icon with a spinner. */
  loading?: boolean;
  action?: { label: string; onPress: () => void };
};

/**
 * Centered card for empty, loading, error and "not designed yet" states. Stitch has no designs
 * for these, so they're built only from existing tokens and components.
 */
export function StateCard({ title, message, icon, tone = 'muted', loading, action }: Props) {
  const { colors } = useTheme();
  const iconColor = tone === 'danger' ? colors.danger.dot : colors.textMuted;

  return (
    <Card style={styles.card}>
      {loading ? <ActivityIndicator color={colors.primary} /> : icon ? <Icon name={icon} size={32} color={iconColor} /> : null}
      <AppText variant="headlineSm" color="textStrong" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodyMd" color="textMuted" align="center">
          {message}
        </AppText>
      ) : null}
      {action ? <Button label={action.label} variant="secondary" onPress={action.onPress} style={styles.action} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  action: { marginTop: spacing.sm },
});
