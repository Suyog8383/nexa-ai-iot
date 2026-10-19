import { View } from 'react-native';

import { Placeholder } from '@/components/layout/Placeholder';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useTheme, type ThemePreference } from '@/theme/useTheme';
import { spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const { preference, setPreference } = useTheme();
  return (
    <Placeholder title="Profile" icon="person" message="Account and settings design pending in Stitch.">
      <Card style={{ gap: spacing.sm + 4 }}>
        <View>
          <AppText variant="labelLg" color="textStrong">
            Appearance
          </AppText>
          <AppText variant="bodySm" color="textMuted">
            Follow your device setting or pick a theme.
          </AppText>
        </View>
        <SegmentedControl<ThemePreference>
          appearance="tiles"
          value={preference}
          onChange={setPreference}
          segments={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light', icon: 'light_mode' },
            { value: 'dark', label: 'Dark', icon: 'dark_mode' },
          ]}
        />
      </Card>
    </Placeholder>
  );
}
