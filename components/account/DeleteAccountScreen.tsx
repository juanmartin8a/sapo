import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Easing,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    Redirect,
    useLocalSearchParams,
    useNavigationContainerRef,
    useRootNavigationState,
    useRouter,
} from "expo-router";

import { authClient } from "@/lib/auth-client";
import { APP_ROUTES } from "@/constants/routes";
import { SETTINGS_COLORS } from "@/constants/settings";
import { getSessionUserAuthState } from "@/utils/auth";
import { triggerErrorHaptic, triggerStrongImpactHaptic } from "@/lib/haptics";

type ConfirmationStatus =
    | "checking"
    | "processing"
    | "completed"
    | "home"
    | "failed";

type RouteState = {
    index?: number;
    routes?: RouteRecord[];
    [key: string]: unknown;
};

type RouteRecord = {
    name?: string;
    state?: RouteState;
    [key: string]: unknown;
};

const DELETE_ACCOUNT_ROUTE_NAME = "delete-account";
const SETTINGS_MODAL_ROUTE_NAME = "settings-modal";
const DELETE_ACCOUNT_ERROR_MESSAGE = "Unable to delete the account. Please try the email link again.";
const completedDeleteAccountTokens = new Set<string>();
const deleteAccountTokenRequests = new Map<string, Promise<void>>();

function getTokenParam(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function clampNavigationIndex(index: number | undefined, routesLength: number) {
    const lastIndex = routesLength - 1;
    const currentIndex = index ?? lastIndex;

    return Math.max(0, Math.min(currentIndex, lastIndex));
}

function hasFocusedRouteName(state: RouteState, routeName: string): boolean {
    const routes = state.routes;

    if (!routes || routes.length === 0) {
        return false;
    }

    const focusedRoute = routes[clampNavigationIndex(state.index, routes.length)];

    if (!focusedRoute) {
        return false;
    }

    if (focusedRoute.name === routeName) {
        return true;
    }

    return focusedRoute.state ? hasFocusedRouteName(focusedRoute.state, routeName) : false;
}

function removeSettingsModalRoute(state: RouteState): RouteState {
    let didChange = false;
    const routes = state.routes?.flatMap((route) => {
        if (route.name === SETTINGS_MODAL_ROUTE_NAME) {
            didChange = true;
            return [];
        }

        if (!route.state) {
            return [route];
        }

        const childState = removeSettingsModalRoute(route.state);

        if (childState === route.state) {
            return [route];
        }

        didChange = true;
        return [{ ...route, state: childState }];
    });

    if (!routes || routes.length === 0 || !didChange) {
        return state;
    }

    return {
        ...state,
        index: clampNavigationIndex(state.index, routes.length),
        routes,
    };
}

function confirmDeleteAccountToken(token: string) {
    if (completedDeleteAccountTokens.has(token)) {
        return Promise.resolve();
    }

    const activeRequest = deleteAccountTokenRequests.get(token);

    if (activeRequest) {
        return activeRequest;
    }

    const request = (async () => {
        const result = await authClient.deleteUser({ token });

        if (result.error) {
            throw new Error(DELETE_ACCOUNT_ERROR_MESSAGE);
        }

        completedDeleteAccountTokens.add(token);
    })().finally(() => {
        deleteAccountTokenRequests.delete(token);
    });

    deleteAccountTokenRequests.set(token, request);
    return request;
}

function shouldAnimateStatusChange(
    previousStatus: ConfirmationStatus,
    nextStatus: ConfirmationStatus
) {
    const nonTerminalStatuses: ConfirmationStatus[] = ["checking", "processing"];

    return !(
        nonTerminalStatuses.includes(previousStatus) &&
        nonTerminalStatuses.includes(nextStatus)
    );
}

export default function DeleteAccountConfirmationScreen() {
    const router = useRouter();
    const rootNavigation = useNavigationContainerRef();
    const rootNavigationState = useRootNavigationState();
    const params = useLocalSearchParams<{ token?: string | string[] }>();
    const token = useMemo(() => getTokenParam(params.token), [params.token]);
    const { isPending } = authClient.useSession();
    const [status, setStatus] = useState<ConfirmationStatus>("checking");
    const [visibleStatus, setVisibleStatus] = useState<ConfirmationStatus>("checking");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [cardTransitionValue] = useState(() => new Animated.Value(1));
    const cardTransitionRunRef = useRef(0);
    const lastHapticStatusRef = useRef<ConfirmationStatus | null>(null);

    const handleReturnHome = useCallback(() => {
        router.dismissTo(APP_ROUTES.HOME);
    }, [router]);

    useEffect(() => {
        if (status === "home" || status === visibleStatus) {
            return;
        }

        if (!shouldAnimateStatusChange(visibleStatus, status)) {
            const timeout = setTimeout(() => {
                setVisibleStatus(status);
            }, 0);

            return () => {
                clearTimeout(timeout);
            };
        }

        const transitionRun = cardTransitionRunRef.current + 1;
        cardTransitionRunRef.current = transitionRun;
        cardTransitionValue.stopAnimation();

        Animated.timing(cardTransitionValue, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!finished || cardTransitionRunRef.current !== transitionRun) {
                return;
            }

            setVisibleStatus(status);
            cardTransitionValue.setValue(0);
            Animated.timing(cardTransitionValue, {
                toValue: 1,
                duration: 180,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        });
    }, [cardTransitionValue, status, visibleStatus]);

    useEffect(() => {
        if (!hasFocusedRouteName(rootNavigationState as RouteState, DELETE_ACCOUNT_ROUTE_NAME)) {
            return;
        }

        const nextNavigationState = removeSettingsModalRoute(rootNavigationState as RouteState);

        if (
            nextNavigationState === rootNavigationState ||
            !hasFocusedRouteName(nextNavigationState, DELETE_ACCOUNT_ROUTE_NAME) ||
            !rootNavigation.isReady()
        ) {
            return;
        }

        rootNavigation.resetRoot(
            nextNavigationState as Parameters<typeof rootNavigation.resetRoot>[0]
        );
    }, [rootNavigation, rootNavigationState]);

    useEffect(() => {
        if (status !== "completed" && status !== "failed") {
            return;
        }

        if (lastHapticStatusRef.current === status) {
            return;
        }

        lastHapticStatusRef.current = status;

        if (status === "completed") {
            triggerStrongImpactHaptic();
            return;
        }

        triggerErrorHaptic();
    }, [status]);

    useEffect(() => {
        let didCancel = false;
        let statusTimeout: ReturnType<typeof setTimeout> | null = null;

        const scheduleStatus = (nextStatus: ConfirmationStatus) => {
            if (statusTimeout) {
                clearTimeout(statusTimeout);
            }

            statusTimeout = setTimeout(() => {
                if (!didCancel) {
                    setStatus(nextStatus);
                }
            }, 0);
        };

        const clearScheduledStatus = () => {
            if (statusTimeout) {
                clearTimeout(statusTimeout);
                statusTimeout = null;
            }
        };

        const cleanup = () => {
            didCancel = true;
            clearScheduledStatus();
        };

        if (!token) {
            scheduleStatus("home");
            return cleanup;
        }

        if (completedDeleteAccountTokens.has(token)) {
            scheduleStatus("completed");
            return cleanup;
        }

        const activeRequest = deleteAccountTokenRequests.get(token);

        if (activeRequest) {
            scheduleStatus("processing");

            activeRequest
                .then(() => {
                    clearScheduledStatus();

                    if (!didCancel) {
                        setStatus("completed");
                    }
                })
                .catch((error) => {
                    clearScheduledStatus();

                    if (didCancel) {
                        return;
                    }

                    if (__DEV__) {
                        console.warn("Delete account confirmation failed", error);
                    }

                    setErrorMessage(DELETE_ACCOUNT_ERROR_MESSAGE);
                    setStatus("failed");
                });

            return cleanup;
        }

        if (isPending) {
            scheduleStatus("checking");
            return cleanup;
        }

        void (async () => {
            const latestSession = (await authClient.getSession()).data;
            const latestAuthState = getSessionUserAuthState(latestSession?.user);

            if (didCancel) {
                return;
            }

            if (latestAuthState !== "authenticated") {
                setStatus("home");
                return;
            }

            setStatus("processing");

            await confirmDeleteAccountToken(token);

            if (didCancel) {
                return;
            }

            setStatus("completed");
        })().catch((error) => {
            if (didCancel) {
                return;
            }

            if (__DEV__) {
                console.warn("Delete account confirmation failed", error);
            }

            setErrorMessage(DELETE_ACCOUNT_ERROR_MESSAGE);
            setStatus("failed");
        });

        return cleanup;
    }, [isPending, token]);

    if (status === "home") {
        return <Redirect href={APP_ROUTES.HOME} />;
    }

    const cardAnimatedStyle = {
        opacity: cardTransitionValue,
        transform: [
            {
                scale: cardTransitionValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                }),
            },
        ],
    };

    const title =
        visibleStatus === "completed"
            ? "Account deleted"
            : visibleStatus === "failed"
              ? "Deletion failed"
              : "Deleting account";
    const message =
        visibleStatus === "completed"
            ? "Your account deletion was confirmed. We are finishing provider cleanup now."
            : visibleStatus === "failed"
              ? errorMessage ?? "Unable to delete the account. Please try the email link again."
              : "Keep this screen open while we confirm deletion.";

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.card, cardAnimatedStyle]}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>
                {visibleStatus === "completed" || visibleStatus === "failed" ? (
                    <TouchableOpacity
                        activeOpacity={0.75}
                        style={styles.button}
                        onPress={handleReturnHome}
                    >
                        <Text style={styles.buttonText}>Return home</Text>
                    </TouchableOpacity>
                ) : null}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: SETTINGS_COLORS.screenBackground,
        padding: 24,
    },
    card: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 28,
        backgroundColor: "#F8FBF6",
        padding: 24,
        gap: 14,
    },
    title: {
        color: SETTINGS_COLORS.primaryText,
        fontSize: 24,
        fontWeight: "700",
    },
    message: {
        color: "#4C6349",
        fontSize: 16,
        lineHeight: 22,
    },
    button: {
        marginTop: 8,
        alignItems: "center",
        borderRadius: 18,
        backgroundColor: SETTINGS_COLORS.primaryText,
        paddingVertical: 14,
        paddingHorizontal: 18,
    },
    buttonText: {
        color: "#F8FBF6",
        fontSize: 16,
        fontWeight: "700",
    },
});
