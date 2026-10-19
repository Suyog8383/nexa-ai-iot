import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Inset } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import type { AssistantContext, RuleSuggestion } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export function UserBubble({ text, time }: { text: string; time: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.user, { backgroundColor: colors.primaryFill }]}>
      <AppText variant="bodyLg" tint={colors.onPrimaryFill} style={{ fontFamily: 'Inter_500Medium' }}>
        {text}
      </AppText>
      <AppText variant="caption" tint={colors.onPrimaryFill} align="right" style={{ opacity: 0.75 }} tabular>
        {time}
      </AppText>
    </View>
  );
}

export function AssistantBubble({ text, context, typing }: { text?: string; context?: AssistantContext; typing?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.assistantRow}>
      <IconTile name="eco" size={32} color={colors.onPrimaryFill} tint={colors.primaryFill} />
      <View style={[styles.assistant, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {typing ? (
          <AppText variant="bodyMd" color="textMuted">
            Nexa is analysing your sensor timeline…
          </AppText>
        ) : (
          <AppText variant="bodyMd" color="text">
            {text}
          </AppText>
        )}
        {context && (
          <>
            <Inset style={{ gap: spacing.xs }}>
              <View style={styles.between}>
                <AppText variant="labelMd" color="textStrong">
                  {context.device}
                </AppText>
                <Badge label={context.status} kind="success" />
              </View>
              <View style={styles.valueRow}>
                <AppText variant="headlineMd" color="textStrong" tabular>
                  {context.value}
                </AppText>
                <AppText variant="labelSm" color="textMuted">
                  {context.caption}
                </AppText>
              </View>
              <AppText variant="labelSm" color="textMuted">
                {context.corridor}
              </AppText>
            </Inset>
            <View style={styles.tip}>
              <Icon name="lightbulb" size={18} color={colors.warning.dot} />
              <AppText variant="bodySm" color="text" style={{ flex: 1 }}>
                {context.tip}
              </AppText>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

type SuggestionProps = { suggestion: RuleSuggestion; created: boolean; onCreate: () => void; onDismiss: () => void };

export function RuleSuggestionCard({ suggestion, created, onCreate, onDismiss }: SuggestionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.suggestion, { backgroundColor: colors.surface, borderColor: colors.primaryBorder }]}>
      <View style={styles.inline}>
        <Icon name="notification_add" size={20} color={colors.primary} />
        <AppText variant="labelLg" color="textStrong" style={{ flex: 1 }}>
          {suggestion.title}
        </AppText>
      </View>
      <AppText variant="bodySm" color="textMuted">
        {suggestion.description}
      </AppText>
      {created ? (
        <View style={[styles.created, { backgroundColor: colors.success.bg, borderColor: colors.success.border }]}>
          <Icon name="verified" size={18} color={colors.success.fg} />
          <AppText variant="labelMd" tint={colors.success.fg} style={{ flex: 1 }}>
            Rule created in Alerts: Notify if Living Room temp drops below {suggestion.rule.threshold}°C.
          </AppText>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label="Create Alert Rule" icon="add_alert" onPress={onCreate} compact style={{ flex: 1 }} />
          <Button label="Dismiss" variant="secondary" onPress={onDismiss} compact />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  user: { alignSelf: 'flex-end', maxWidth: '82%', padding: spacing.md, borderRadius: radius.xl, borderBottomRightRadius: radius.sm, gap: spacing.sm },
  assistantRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  assistant: { flex: 1, padding: spacing.md, borderRadius: radius.xl, borderTopLeftRadius: radius.sm, borderWidth: 1, gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  tip: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  suggestion: { marginLeft: 40, padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, gap: spacing.sm + 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  created: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 4, borderRadius: radius.lg, borderWidth: 1 },
});
