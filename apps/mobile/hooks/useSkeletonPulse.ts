import { useEffect, useState } from "react";
import { Animated } from "react-native";

import {
    UI_SKELETON_PULSE_DURATION,
    UI_SKELETON_PULSE_MIN_OPACITY,
} from "@/constants/ui";

export default function useSkeletonPulse(isActive: boolean) {
    const [opacity] = useState(() => new Animated.Value(1));

    useEffect(() => {
        if (!isActive) {
            opacity.setValue(1);
            return;
        }

        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: UI_SKELETON_PULSE_MIN_OPACITY,
                    duration: UI_SKELETON_PULSE_DURATION,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: UI_SKELETON_PULSE_DURATION,
                    useNativeDriver: true,
                }),
            ])
        );

        animation.start();

        return () => {
            animation.stop();
            opacity.setValue(1);
        };
    }, [isActive, opacity]);

    return opacity;
}
