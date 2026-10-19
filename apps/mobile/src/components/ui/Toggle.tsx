import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/useTheme';

const WIDTH = 48;
const HEIGHT = 28;
const THUMB = 22;

type Props = { value: boolean; onChange: (value: boolean) => void; accessibilityLabel?: string };

/** Pill switch: 48×28 track, primary fill when on. Dark theme uses a navy thumb like the Stitch toggles. */
export function Toggle({ value, onChange, accessibilityLabel }: Props) {
  const { colors, scheme } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value, progress]);

  const off = colors.toggleOff;
  const on = colors.primaryFill;
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.value, [0, 1], [off, on]) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * (WIDTH - THUMB - 6) }] }));

  const thumbColor = scheme === 'dark' && value ? colors.background : '#FFFFFF';

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!value)}
      hitSlop={8}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.thumb, { backgroundColor: scheme === 'dark' && !value ? colors.textFaint : thumbColor }, thumb]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT, padding: 3, justifyContent: 'center' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
