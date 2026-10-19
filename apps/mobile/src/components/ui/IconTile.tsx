import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';
import { radius } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';

type Props = {
  name: IconName;
  size?: number;
  /** Accent colour for the glyph; background is a 15% tint of it. */
  color?: string;
  tint?: string;
  shape?: 'square' | 'circle';
  filled?: boolean;
};

/** Icon housed in a tinted square (dark) / pale tinted square (light). */
export function IconTile({ name, size = 40, color, tint, shape = 'square', filled }: Props) {
  const { colors, scheme } = useTheme();
  const fg = color ?? colors.primary;
  const bg = tint ?? (scheme === 'dark' ? colors.surfaceHigh : colors.primaryTint);
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: shape === 'circle' ? size : radius.lg,
          backgroundColor: bg,
          borderColor: scheme === 'light' ? colors.primaryBorder : 'transparent',
        },
      ]}>
      <Icon name={name} size={Math.round(size * 0.5)} color={fg} filled={filled} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
