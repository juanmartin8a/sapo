import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet } from "react-native";
import XIcon from "../../../assets/icons/x.svg";

const isIOS = Platform.OS === "ios";

export default function ProfileModalLayout() {
    const router = useRouter();

    const handleDismiss = useCallback(() => {
        router.dismissTo("/");
    }, [router]);

    const renderCloseButton = useCallback(() => {
        return (
            <Pressable
                onPress={handleDismiss}
                hitSlop={4}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
                <XIcon width={26} height={26} stroke="black" />
            </Pressable>
        );
    }, [handleDismiss]);

    return (
        <Stack
            screenOptions={{
                headerShown: true,
                headerShadowVisible: false,
                headerStyle: styles.header,
                headerTintColor: "black",
                contentStyle: styles.content,
                headerRight: isIOS ? renderCloseButton : undefined,
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: "Settings",
                }}
            />
            <Stack.Screen
                name="data-controls"
                options={{
                    title: "Data controls",
                    headerRight: () => null,
                    headerBackButtonDisplayMode: "minimal",
                }}
            />
            <Stack.Screen
                name="subscription"
                options={{
                    title: "Subscription",
                    headerRight: () => null,
                    headerBackButtonDisplayMode: "minimal",
                }}
            />
        </Stack>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "#f2f2f2",
    },
    content: {
        backgroundColor: "#f2f2f2",
    },
    closeButton: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
    },
    closeButtonPressed: {
        opacity: 0.7,
    },
});
