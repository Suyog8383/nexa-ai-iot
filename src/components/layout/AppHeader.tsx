import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import type { StatusKind } from '@/data/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Props = { status?: { label: string; kind: StatusKind } };

/** Global top bar: logo, system status pill, notifications bell, profile avatar. */
export function AppHeader({ status = { label: 'All Normal', kind: 'success' } }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={styles.brand}>
        <LinearGradient colors={colors.gradientAccent} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.logo}>
          <Icon name="eco" size={22} color={colors.onPrimaryFill} />
        </LinearGradient>
        <View>
          <AppText variant="headlineSm" color="textStrong">
            Nexa
          </AppText>
          <AppText variant="caption" color="textMuted" style={{ letterSpacing: 0 }}>
            Smart Habitat
          </AppText>
        </View>
      </View>
      <View style={styles.status}>
        <Badge label={status.label} kind={status.kind} dot bordered />
      </View>
      <Pressable accessibilityLabel="Notifications" hitSlop={8} onPress={() => router.push('/notifications')} style={styles.iconBtn}>
        <Icon name="notifications" size={24} color={colors.textMuted} />
      </Pressable>
      <Pressable accessibilityLabel="Profile and settings" onPress={() => router.push('/profile')} style={[styles.avatar, { backgroundColor: colors.primaryFill }]}>
        <Icon name="person" size={20} color={colors.onPrimaryFill} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: { width: 36, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  status: { flex: 1, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
