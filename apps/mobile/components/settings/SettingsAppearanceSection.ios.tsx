import { HStack, RNHostView, Picker, Text } from '@expo/ui/swift-ui';
import { foregroundStyle, listRowBackground, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';
import { THEME_ICONS, THEME_OPTIONS } from '@/constants/theme';
import SettingsIcon from '@/components/settings/ui/SettingsIcon';
import { useAppTheme } from '@/providers/AppThemeProvider';

export default function SettingsAppearanceSection() {
    const { preference, setPreference, settingsColors } = useAppTheme();

    return (
        <Picker
            label={
                <HStack spacing={12}>
                    <RNHostView matchContents>
                        <SettingsIcon icon={THEME_ICONS[preference]} color={settingsColors.primaryText} />
                    </RNHostView>
                    <Text modifiers={[foregroundStyle('primary')]}>Appearance</Text>
                </HStack>
            }
            selection={preference}
            onSelectionChange={setPreference}
            modifiers={[
                pickerStyle('menu'),
                tint(settingsColors.mutedText),
                listRowBackground(settingsColors.surface),
            ]}
        >
            {THEME_OPTIONS.map(option => (
                <Text key={option.value} modifiers={[tag(option.value)]}>{option.label}</Text>
            ))}
        </Picker>
    );
}
