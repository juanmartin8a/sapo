import useTranslationInputStore from "@/stores/translationInputStore"
import useTranslateButtonStore from "@/stores/translateButtonStore"
import { Alert, View } from "react-native"
import ArrowRightIcon from "@/assets/icons/arrow-right.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import SquareIcon from "@/assets/icons/square.svg";
import MoreHorizontalIcon from "@/assets/icons/more-horizontal.svg";
import usePagerStore from "@/stores/pagerStore";
import useTranslationStore from "@/stores/translationStore";
import { Pressable } from "react-native-gesture-handler";
import { useCallback } from "react";
import { useAuthState } from "@/providers/AuthStateProvider";
import useTransformationOperationStore from "@/stores/transformationOperationStore";
import useLocalModelStore from "@/stores/localModelStore";
import { triggerErrorHaptic, triggerMediumImpactHaptic } from "@/lib/haptics";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import useSubscriptionAccess from "@/hooks/useSubscriptionAccess";

type TranslateButtonProps = {
    pagerProgress: SharedValue<number>;
};

const TranslateButton = ({ pagerProgress }: TranslateButtonProps) => {
    const translateButtonState = useTranslateButtonStore((state) => state.state)
    const lastInput = useTranslationStore((state) => state.lastInput)
    const hasText = useTranslationInputStore((state) => state.hasText)
    const { status: authStatus } = useAuthState()
    const isAuthPending = authStatus === 'checking'
    const isAuthenticatedUser = authStatus === 'authenticated'
    const { hasActiveSubscription } = useSubscriptionAccess()

    const goToPage = usePagerStore((state) => state.goToPage)
    const operation = useTransformationOperationStore((state) => state.operation)
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled)

    const sendMessage = useTranslationStore((state) => state.sendMessage)
    const stopStream = useTranslationStore((state) => state.stopStream)
    const repeatLastTranslation = useTranslationStore((state) => state.repeatLastTranslation)
    const arrowAnimatedStyle = useAnimatedStyle(() => ({
        opacity: 1 - pagerProgress.get(),
    }));
    const repeatAnimatedStyle = useAnimatedStyle(() => ({
        opacity: pagerProgress.get(),
    }));

    const next = useCallback(() => {
        if (translateButtonState === 'loading') {
            return;
        }

        if (translateButtonState === 'stop') {
            stopStream();
            goToPage(1);
            return;
        }

        if (translateButtonState !== 'repeat' && !hasText) {
            return;
        }

        const text = useTranslationInputStore.getState().text;
        const input = translateButtonState === 'repeat' ? lastInput : text;
        if (!input) {
            return;
        }

        const requiresOnlineAuth = operation !== 'translate' || !isLocalModelEnabled;

        if (!isAuthenticatedUser && requiresOnlineAuth) {
            if (isAuthPending) {
                return;
            }

            triggerErrorHaptic();
            Alert.alert(
                "Sign in required",
                "Sign in to use online translations or respellings, or download a local model and enable local translation."
            );
            return;
        }

        const inputLimit = getInputLimit(operation, hasActiveSubscription, isLocalModelEnabled);

        if (operation === 'respell' && hasActiveSubscription === false) {
            Alert.alert("Subscription required", "Respelling requires an active subscription.");
            return;
        }

        if (inputLimit === null) {
            Alert.alert("Checking subscription", "Please wait a moment and try again.");
            return;
        }

        if (getCharacterCount(input) > inputLimit) {
            Alert.alert(
                "Input limit exceeded",
                `Shorten the input to ${inputLimit} characters before continuing.`
            );
            return;
        }

        triggerMediumImpactHaptic();

        if (translateButtonState === 'repeat') {
            repeatLastTranslation();
        } else {
            sendMessage(text)
        }

        goToPage(1);
    }, [goToPage, hasActiveSubscription, hasText, isAuthPending, isAuthenticatedUser, isLocalModelEnabled, lastInput, operation, repeatLastTranslation, sendMessage, stopStream, translateButtonState]);


    return (
        <Pressable
            onPress={next}
            disabled={
                (translateButtonState === 'next' && !hasText) ||
                (translateButtonState === 'repeat' && lastInput === null)
            }
        >
            <View style={{ padding: 6 }}>
                {(translateButtonState === 'next' || translateButtonState === 'repeat') && (
                    <View style={{ position: 'relative', width: 32, height: 32 }}>
                        <Animated.View style={[{ position: 'absolute' }, arrowAnimatedStyle]}>
                            <ArrowRightIcon style={{ opacity: hasText ? 1.0 : 0.35 }} width={32} height={32} stroke="black" />
                        </Animated.View>
                        {lastInput !== null && (
                            <Animated.View style={[{ position: 'absolute' }, repeatAnimatedStyle]}>
                                <RepeatIcon width={32} height={32} stroke="black" />
                            </Animated.View>
                        )}
                    </View>
                )}
                {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
                {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
            </View>
        </Pressable>
    )
}

export default TranslateButton
