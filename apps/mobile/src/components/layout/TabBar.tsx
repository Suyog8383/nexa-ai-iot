import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/theme/useTheme';
import { layout, spacing } from '@/theme/tokens';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  devices: { label: 'Devices', icon: 'grid_view' },
  assistant: { label: 'AI Assistant', icon: 'auto_awesome' },
  alerts: { label: 'Alerts', icon: 'notifications_active' },
};

/** Floating bottom bar: frosted top-tier surface, accent tint on the active tab. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom, borderTopColor: colors.border }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={40} tint={scheme} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const color = focused ? colors.tabActive : colors.tabInactive;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={styles.item}>
              <Icon name={tab.icon} size={26} color={color} filled={focused && scheme === 'light'} />
              <AppText variant="labelSm" tint={color} style={{ letterSpacing: 0 }}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', height: layout.tabBarHeight, paddingHorizontal: spacing.sm },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
