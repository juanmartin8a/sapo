import useTextToTranslate from "@/stores/textToTranslateStore"
import useTranslateButtonStateNotifier from "@/stores/translateButtonStateNotifier"
import { Alert, View } from "react-native"
import ArrowRightIcon from "@/assets/icons/arrow-right.svg";
import RepeatIcon from "@/assets/icons/repeat.svg";
import SquareIcon from "@/assets/icons/square.svg";
import MoreHorizontalIcon from "@/assets/icons/more-horizontal.svg";
import usePagerPos from "@/stores/pagerPosStore";
import useSseStore from "@/stores/sseStore";
import { Pressable } from "react-native-gesture-handler";
import { useCallback } from "react";
import { authClient } from "@/clients/auth-client";
import { getSessionUserAuthState } from "@/utils/auth";
import { useTransformationOperationStore } from "@/stores";
import useLocalModelStore from "@/stores/localModelStore";
import useSubscriptionStatusStore from "@/stores/subscriptionStatusStore";
import { triggerErrorHaptic, triggerMediumImpactHaptic, triggerStopHaptic } from "@/utils/haptics";
import { getCharacterCount, getInputLimit } from "@/utils/inputLimits";

const TranslateButton = () => {
    const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)
    const lastInput = useSseStore((state) => state.lastInput)
    const text = useTextToTranslate((state) => state.text)
    const { data: session, isPending: isAuthPending } = authClient.useSession()
    const authState = getSessionUserAuthState(session?.user)
    const isAuthenticatedUser = authState === 'authenticated'
    const subscriptionUserId = useSubscriptionStatusStore((state) => state.userId)
    const hasActiveSubscription = useSubscriptionStatusStore((state) => state.hasActiveSubscription)

    const goToPage = usePagerPos((state) => state.goToPage)
    const offset = usePagerPos((state) => state.offset)
    const operation = useTransformationOperationStore((state) => state.operation)
    const isLocalModelEnabled = useLocalModelStore((state) => state.isEnabled)

    const sendMessage = useSseStore((state) => state.sendMessage)
    const stopStream = useSseStore((state) => state.stopStream)
    const repeatLastTranslation = useSseStore((state) => state.repeatLastTranslation)

    const arrowOpacity = 1 - offset;
    // console.log(`TranslateButton: ${arrowOpacity}`)
    const loadingOpacity = offset;

    const next = useCallback(() => {
        if (translateButtonState === 'loading') {
            return;
        }

        if (translateButtonState === 'stop') {
            triggerStopHaptic();
            stopStream();
            goToPage(1);
            return;
        }

        if (translateButtonState !== 'repeat' && text.trim().length === 0) {
            return;
        }

        const input = translateButtonState === 'repeat' ? lastInput : text;
        if (!input) {
            return;
        }

        const effectiveSubscriptionStatus = isAuthPending
            ? null
            : !isAuthenticatedUser
              ? false
              : subscriptionUserId === session?.user?.id
                ? hasActiveSubscription
                : null;
        const inputLimit = getInputLimit(operation, effectiveSubscriptionStatus);

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

        triggerMediumImpactHaptic();

        if (translateButtonState === 'repeat') {
            repeatLastTranslation();
        } else {
            sendMessage(text)
        }

        goToPage(1);
    }, [goToPage, hasActiveSubscription, isAuthPending, isAuthenticatedUser, isLocalModelEnabled, lastInput, operation, repeatLastTranslation, sendMessage, session?.user?.id, stopStream, subscriptionUserId, text, translateButtonState]);


    return (
        <Pressable
            onPress={next}
            disabled={
                (translateButtonState === 'next' && text.trim().length === 0) ||
                (translateButtonState === 'repeat' && lastInput === null)
            }
        >
            <View style={{ padding: 6 }}>
                {(translateButtonState === 'next' || translateButtonState === 'repeat') &&
                    <View style={{ position: 'relative', width: 32, height: 32 }}>
                        <View style={{ position: 'absolute', opacity: arrowOpacity }}>
                            <ArrowRightIcon style={{ opacity: text !== "" ? 1.0 : 0.35 }} width={32} height={32} stroke="black" />
                        </View>
                        {(lastInput !== null) &&
                            <View style={{ position: 'absolute', opacity: loadingOpacity }}>
                                <RepeatIcon width={32} height={32} stroke="black" />
                            </View>
                        }
                    </View>
                }
                {translateButtonState === 'loading' && <MoreHorizontalIcon width={24} height={24} stroke="black" />}
                {translateButtonState === 'stop' && <SquareIcon width={18} height={18} stroke="black" fill="black" />}
            </View>
        </Pressable>
    )
}

export default TranslateButton
