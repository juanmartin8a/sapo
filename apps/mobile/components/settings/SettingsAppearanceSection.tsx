import { Picker, Column, Row, RNHostView, Text } from '@expo/ui';
import { THEME_ICONS, THEME_OPTIONS } from '@/constants/theme';
import SettingsIcon from '@/components/settings/ui/SettingsIcon';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function SettingsAppearanceSection() {
    const { preference, setPreference, settingsColors } = useAppTheme();

    return (
        <Column spacing={8}>
            <Row alignment="center" spacing={12}>
                <RNHostView matchContents>
                    <SettingsIcon icon={THEME_ICONS[preference]} color={settingsColors.primaryText} />
                </RNHostView>
                <Text textStyle={{ color: settingsColors.primaryText }}>Appearance</Text>
            </Row>
            <Picker
                selectedValue={preference}
                onValueChange={setPreference}
                appearance="menu"
                accessibilityLabel="Appearance"
            >
                {THEME_OPTIONS.map(option => (
                    <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
            </Picker>
        </Column>
    );
}
