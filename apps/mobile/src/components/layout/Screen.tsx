import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';
import { layout, spacing } from '@/theme/tokens';

type Props = {
  header?: ReactNode;
  children: ReactNode;
  /** Pinned content above the tab bar (e.g. chat composer). */
  footer?: ReactNode;
  /** True for tab screens so content clears the floating tab bar. */
  withTabBar?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: React.Ref<ScrollView>;
};

export function Screen({ header, children, footer, withTabBar, contentStyle, scrollRef }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomClearance = withTabBar ? layout.tabBarHeight + insets.bottom : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: (footer ? spacing.md : spacing.xl) + (footer ? 0 : bottomClearance) }, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer && <View style={{ paddingHorizontal: spacing.margin, paddingBottom: spacing.sm + bottomClearance }}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.margin, paddingTop: spacing.md, gap: spacing.md },
});
