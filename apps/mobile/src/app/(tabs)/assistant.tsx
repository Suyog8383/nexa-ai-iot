import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, type ScrollView } from 'react-native';

import { AssistantBubble, RuleSuggestionCard, UserBubble } from '@/components/assistant/ChatBubbles';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { PulseDot } from '@/components/ui/Badge';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile } from '@/components/ui/IconTile';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { ChatMessage } from '@/domain/types';
import { useAssistantIntro } from '@/hooks/useAssistantIntro';
import { askNexa } from '@/services/assistant';
import { useAlertsStore } from '@/stores/alertsStore';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing, typography } from '@/theme/tokens';

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AssistantScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const rules = useAlertsStore((s) => s.rules);
  const { q } = useLocalSearchParams<{ q?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const intro = useAssistantIntro();
  // Read once on mount. If the intro ever loads asynchronously, seed `messages` when it arrives.
  const introLength = intro.data?.conversation.length ?? 0;
  const [messages, setMessages] = useState<ChatMessage[]>(intro.data?.conversation ?? []);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: question, time: timeNow() }]);
    setPending(true);
    try {
      const reply = await askNexa(question);
      setMessages((prev) => [...prev, { ...reply, id: `a-${Date.now()}` }]);
    } catch {
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'assistant', text: 'Nexa could not reach your hub. Check your connection and try again.' }]);
    } finally {
      setPending(false);
    }
  }

  // Prompt handed over from Home's "Nexa Assistant" card.
  useEffect(() => {
    if (!q) return;
    const handoff = setTimeout(() => {
      send(q);
      router.setParams({ q: undefined });
    });
    return () => clearTimeout(handoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (messages.length > introLength || pending) scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending, introLength]);


  const composer = (
    <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.composer, { backgroundColor: colors.inset, borderColor: colors.border }]}>
        <Icon name="auto_awesome" size={20} color={colors.primary} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send(draft)}
          placeholder="Ask Nexa about your home…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          style={[typography.bodyMd, styles.input, { color: colors.textStrong }]}
        />
        <Pressable accessibilityLabel="Voice input" hitSlop={6}>
          <Icon name="mic" size={20} color={colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityLabel="Send"
          onPress={() => send(draft)}
          disabled={!draft.trim() || pending}
          style={[styles.send, { backgroundColor: colors.primaryFill, opacity: draft.trim() && !pending ? 1 : 0.6 }]}>
          <Icon name="arrow_upward" size={20} color={colors.onPrimaryFill} />
        </Pressable>
      </View>
      <View style={styles.privacy}>
        <Icon name="lock" size={12} color={colors.textMuted} />
        <AppText variant="caption" color="textMuted" style={{ letterSpacing: 0 }}>
          Private home context • Local confirmation required
        </AppText>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<AppHeader />} footer={composer} withTabBar scrollRef={scrollRef}>
        <View style={{ gap: spacing.xs }}>
          <View style={styles.inline}>
            <PulseDot color={colors.primary} size={8} />
            <AppText variant="caption" color="textMuted" uppercase numberOfLines={1} style={{ flex: 1 }}>
              Context: Living Room Monitor (ESP32 • BME280 • 5V USB Powered)
            </AppText>
          </View>
          <AppText variant="headlineLg" color="textStrong">
            Nexa AI Assistant
          </AppText>
          <AppText variant="bodyLg" color="textMuted">
            Ask anything about your home environment and comfort.
          </AppText>
        </View>

        <SectionHeader title="Suggested Inquiries" uppercase action={{ label: 'Instant Context', icon: 'bolt' }} />
        <View style={{ gap: spacing.sm }}>
          {(intro.data?.suggestions ?? []).map((s) => (
            <Pressable
              key={s.text}
              accessibilityRole="button"
              onPress={() => send(s.text)}
              style={({ pressed }) => [styles.inquiry, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
              <IconTile name={s.icon as IconName} size={32} />
              <AppText variant="labelLg" color="textStrong" numberOfLines={1} style={{ flex: 1 }}>
                {s.text}
              </AppText>
              <Icon name="north_east" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} text={m.text} time={m.time} />
            ) : (
              <View key={m.id} style={{ gap: spacing.sm }}>
                <AssistantBubble text={m.text} context={m.context} />
                {m.suggestion && !dismissed.includes(m.id) && (
                  <RuleSuggestionCard
                    suggestion={m.suggestion}
                    created={rules.some((r) => r.origin === m.id)}
                    onDismiss={() => setDismissed((d) => [...d, m.id])}
                    onCreate={() =>
                      router.push({
                        pathname: '/alert-rule',
                        params: {
                          from: 'assistant',
                          origin: m.id,
                          metric: m.suggestion!.rule.metric,
                          condition: m.suggestion!.rule.condition,
                          threshold: String(m.suggestion!.rule.threshold),
                        },
                      })
                    }
                  />
                )}
              </View>
            ),
          )}
          {pending && <AssistantBubble typing />}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inquiry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.sm + 4, borderRadius: radius.lg, borderWidth: 1 },
  composerCard: { padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, gap: spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, paddingLeft: spacing.md, paddingRight: 6, borderRadius: radius.full, borderWidth: 1 },
  input: { flex: 1, paddingVertical: 0 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});
