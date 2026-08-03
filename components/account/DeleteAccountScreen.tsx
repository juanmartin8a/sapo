import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    StatusBar,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import {
    Redirect,
    useLocalSearchParams,
    useNavigationContainerRef,
    useRootNavigationState,
    useRouter,
} from "expo-router";

import SapoIcon from "@/assets/icons/sapo.svg";
import { authClient } from "@/lib/auth-client";
import { APP_ROUTE_NAMES, APP_ROUTES } from "@/constants/routes";
import { getSessionUserAuthState } from "@/utils/auth";
import { triggerErrorHaptic, triggerStrongImpactHaptic } from "@/lib/haptics";
import { useAuthState } from "@/providers/AuthStateProvider";

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
        if (route.name === APP_ROUTE_NAMES.SETTINGS_MODAL) {
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
    const { width: windowWidth } = useWindowDimensions();
    const router = useRouter();
    const rootNavigation = useNavigationContainerRef();
    const rootNavigationState = useRootNavigationState();
    const params = useLocalSearchParams<{ token?: string | string[] }>();
    const token = useMemo(() => getTokenParam(params.token), [params.token]);
    const { status: authStatus } = useAuthState();
    const isPending = authStatus === "checking";
    const [status, setStatus] = useState<ConfirmationStatus>("checking");
    const [visibleStatus, setVisibleStatus] = useState<ConfirmationStatus>("checking");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [contentTransitionValue] = useState(() => new Animated.Value(1));
    const contentTransitionRunRef = useRef(0);
    const statusToRevealRef = useRef<ConfirmationStatus | null>(null);
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

        const transitionRun = contentTransitionRunRef.current + 1;
        contentTransitionRunRef.current = transitionRun;
        contentTransitionValue.stopAnimation();

        Animated.timing(contentTransitionValue, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (!finished || contentTransitionRunRef.current !== transitionRun) {
                return;
            }

            contentTransitionValue.setValue(0);
            statusToRevealRef.current = status;
            setVisibleStatus(status);
        });
    }, [contentTransitionValue, status, visibleStatus]);

    useEffect(() => {
        if (statusToRevealRef.current !== visibleStatus) {
            return;
        }

        statusToRevealRef.current = null;
        Animated.timing(contentTransitionValue, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [contentTransitionValue, visibleStatus]);

    useEffect(() => {
        if (!hasFocusedRouteName(rootNavigationState as RouteState, APP_ROUTE_NAMES.DELETE_ACCOUNT)) {
            return;
        }

        const nextNavigationState = removeSettingsModalRoute(rootNavigationState as RouteState);

        if (
            nextNavigationState === rootNavigationState ||
            !hasFocusedRouteName(nextNavigationState, APP_ROUTE_NAMES.DELETE_ACCOUNT) ||
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

    const contentAnimatedStyle = {
        opacity: contentTransitionValue,
    };

    const title =
        visibleStatus === "completed"
            ? "Account deleted"
            : visibleStatus === "failed"
              ? "Deletion failed"
              : "Deleting account";
    const message =
        visibleStatus === "completed"
            ? "Account deletion confirmed. We are finishing cleanup now."
            : visibleStatus === "failed"
              ? errorMessage ?? DELETE_ACCOUNT_ERROR_MESSAGE
              : "Keep this screen open while we confirm deletion.";
    const isTerminalStatus = visibleStatus === "completed" || visibleStatus === "failed";
    const sapoWidth = windowWidth * 0.4;
    const sapoHeight = sapoWidth * (800 / 929);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.contentAnchor}>
                <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    style={[styles.content, styles.contentSizer]}
                >
                    <Text style={styles.title}>Deletion failed</Text>
                    <Text style={styles.message}>{DELETE_ACCOUNT_ERROR_MESSAGE}</Text>
                    <View style={styles.button}>
                        <Text style={styles.buttonText}>Return home</Text>
                    </View>
                </View>
                <Animated.View style={[styles.content, styles.activeContent, contentAnimatedStyle]}>
                    <Text accessibilityRole="header" style={styles.title}>
                        {title}
                    </Text>
                    <Text style={styles.message}>{message}</Text>
                    {isTerminalStatus ? (
                        <Pressable
                            accessibilityRole="button"
                            style={({ pressed }) => [
                                styles.button,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={handleReturnHome}
                        >
                            <Text style={styles.buttonText}>Return home</Text>
                        </Pressable>
                    ) : null}
                </Animated.View>
                <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    style={[
                        styles.frog,
                        {
                            left: -(sapoWidth * 0.23),
                            width: sapoWidth,
                            height: sapoHeight,
                        },
                    ]}
                >
                    <SapoIcon width={sapoWidth} height={sapoHeight} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    contentAnchor: {
        position: "relative",
        width: "100%",
        alignItems: "center",
    },
    content: {
        width: "100%",
        maxWidth: 420,
        alignItems: "center",
        paddingHorizontal: 24,
        gap: 14,
    },
    contentSizer: {
        opacity: 0,
    },
    activeContent: {
        position: "absolute",
        top: 0,
        alignSelf: "center",
    },
    title: {
        color: "#000",
        fontSize: 24,
        lineHeight: 29,
        fontWeight: "700",
        textAlign: "center",
    },
    message: {
        maxWidth: 320,
        color: "#666",
        fontSize: 16,
        lineHeight: 22,
        textAlign: "center",
    },
    button: {
        width: "100%",
        maxWidth: 320,
        minHeight: 42,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
        borderRadius: 12,
        backgroundColor: "#000",
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    buttonPressed: {
        opacity: 0.8,
    },
    buttonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    frog: {
        position: "absolute",
        top: "100%",
        marginTop: 56,
    },
});
