import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const reportHapticError = (error: unknown) => {
    if (__DEV__) {
        console.warn('Unable to trigger haptic feedback', error);
    }
};

const trigger = (haptic: () => Promise<void>) => {
    try {
        void haptic().catch((error) => {
            reportHapticError(error);
        });
    } catch (error) {
        reportHapticError(error);
    }
};

export const triggerSoftSelectionHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick));
        return;
    }

    trigger(() => Haptics.selectionAsync());
};

export const triggerSelectionHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click));
        return;
    }

    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
};

export const triggerLightImpactHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press));
        return;
    }

    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
};

export const triggerMediumImpactHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press));
        return;
    }

    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
};

export const triggerStrongImpactHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm));
        return;
    }

    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
};

export const triggerStopHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End));
        return;
    }

    trigger(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
};

export const triggerWarningHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject));
        return;
    }

    trigger(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
};

export const triggerErrorHaptic = () => {
    if (Platform.OS === 'android') {
        trigger(() => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject));
        return;
    }

    trigger(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
};
