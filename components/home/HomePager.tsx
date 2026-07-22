import React, { Children, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import ArrowLeftIcon from "@/assets/icons/arrow-left.svg";

type PageScrollState = "idle" | "dragging" | "settling";

type PagerEvent<Event> = {
    nativeEvent: Event;
};

export type HomePagerHandle = {
    setPage: (page: number) => void;
};

type HomePagerProps = {
    ref?: React.Ref<HomePagerHandle>;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    initialPage?: number;
    onPageScrollStateChanged?: (event: PagerEvent<{ pageScrollState: PageScrollState }>) => void;
    onPageScroll?: (event: PagerEvent<{ offset: number }>) => void;
    onPageSelected?: (event: PagerEvent<{ position: number }>) => void;
    scrollEnabled?: boolean;
    overScrollMode?: "auto" | "always" | "never";
    keyboardDismissMode?: "none" | "on-drag";
    orientation?: "horizontal" | "vertical";
};

export default function HomePager({
    ref,
    children,
    style,
    initialPage = 0,
    onPageScrollStateChanged,
    onPageScroll,
    onPageSelected,
}: HomePagerProps) {
    const [selectedPage, setSelectedPage] = useState(initialPage);
    const selectedPageRef = useRef(initialPage);
    const pages = Children.toArray(children);

    const selectPage = useCallback((page: number) => {
        const nextPage = Math.max(0, Math.min(page, pages.length - 1));

        if (nextPage === selectedPageRef.current) {
            return;
        }

        selectedPageRef.current = nextPage;
        setSelectedPage(nextPage);
        onPageScroll?.({ nativeEvent: { offset: 0 } });
        onPageSelected?.({ nativeEvent: { position: nextPage } });
        onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: "idle" } });
    }, [onPageScroll, onPageScrollStateChanged, onPageSelected, pages.length]);

    useImperativeHandle(ref, () => ({ setPage: selectPage }), [selectPage]);

    return (
        <View style={style}>
            {selectedPage > 0 && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to input"
                    onPress={() => selectPage(selectedPage - 1)}
                    style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
                >
                    <ArrowLeftIcon width={16} height={16} stroke="black" />
                    <Text style={styles.backButtonText}>Input</Text>
                </Pressable>
            )}
            {pages.map((page, index) => (
                <View
                    key={index}
                    style={[styles.page, index !== selectedPage && styles.hiddenPage]}
                >
                    {page}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    backButton: {
        alignItems: "center",
        alignSelf: "flex-start",
        flexDirection: "row",
        gap: 6,
        marginHorizontal: 24,
        paddingVertical: 8,
    },
    backButtonPressed: {
        opacity: 0.55,
    },
    backButtonText: {
        color: "#000",
        fontSize: 14,
        fontWeight: "600",
    },
    page: {
        flex: 1,
    },
    hiddenPage: {
        display: "none",
    },
});
