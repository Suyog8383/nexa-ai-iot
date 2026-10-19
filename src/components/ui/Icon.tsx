import { Text, type StyleProp, type TextStyle } from 'react-native';

import glyphs from '@/assets/fonts/material-symbols.json';
import { fonts } from '@/theme/tokens';

/** Material Symbols Outlined, subset to the glyphs used in the Stitch designs. */
export type IconName = keyof typeof glyphs;

type Props = {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 20, color, filled, style }: Props) {
  return (
    <Text
      accessible={false}
      aria-hidden
      importantForAccessibility="no"
      allowFontScaling={false}
      style={[
        { fontFamily: filled ? fonts.iconFilled : fonts.iconOutlined, fontSize: size, lineHeight: size, color, width: size, height: size, textAlign: 'center' },
        style,
      ]}>
      {String.fromCodePoint(glyphs[name])}
    </Text>
  );
}
