import { useState } from "react";
import { useHeaderHeight } from "expo-router/react-navigation";
import { LayoutChangeEvent, Platform, ScrollView, ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SETTINGS_HEADER_CONTENT_GAP } from "@/constants/settings";

const isIOS = Platform.OS === "ios";

export default function SettingsScrollView({
    contentContainerStyle,
    onLayout,
    ...props
}: ScrollViewProps) {
    const headerHeight = useHeaderHeight();
    const safeAreaInsets = useSafeAreaInsets();
    const [viewportHeight, setViewportHeight] = useState(0);

    const handleLayout = (event: LayoutChangeEvent) => {
        setViewportHeight(event.nativeEvent.layout.height);
        onLayout?.(event);
    };

    const minimumContentHeight = isIOS
        ? Math.max(0, viewportHeight - headerHeight - safeAreaInsets.bottom)
        : viewportHeight;

    return (
        <ScrollView
            {...props}
            alwaysBounceVertical={isIOS}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
                contentContainerStyle,
                {
                    minHeight: minimumContentHeight,
                    paddingTop: (isIOS ? 0 : headerHeight) + SETTINGS_HEADER_CONTENT_GAP,
                },
            ]}
            onLayout={handleLayout}
        />
    );
}
