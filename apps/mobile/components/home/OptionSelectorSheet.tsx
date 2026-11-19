import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useCallback, type RefObject } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type ListRenderItem } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CheckIcon from "@/assets/icons/check.svg";
import type { AppTheme } from "@/constants/theme";
import useThemeStyles from "@/hooks/useThemeStyles";

type SelectorOption = [key: string, label: string];

const SNAP_POINTS = ["45%", "65%"];
const getOptionKey = ([key]: SelectorOption) => key;

interface OptionSelectorSheetProps {
    ref: RefObject<BottomSheet | null>;
    data: SelectorOption[];
    selectedKey: string;
    onClose: () => void;
    onChange: (index: number) => void;
    onItemSelected: (key: string) => void;
}

export default function OptionSelectorSheet({
    ref,
    data,
    selectedKey,
    onClose,
    onChange,
    onItemSelected,
}: OptionSelectorSheetProps) {
    const { styles } = useThemeStyles(createStyles);
    const insets = useSafeAreaInsets();
    const renderItem = useCallback<ListRenderItem<SelectorOption>>(({ item: [key, label] }) => {
        const isSelected = key === selectedKey;

        return (
            <TouchableOpacity
                style={styles.listItem}
                onPress={() => onItemSelected(key)}
                activeOpacity={0.65}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
            >
                <Text style={styles.listItemText}>{label}</Text>
                {isSelected && <CheckIcon height={16 * 1.2} stroke="pink" />}
            </TouchableOpacity>
        );
    }, [onItemSelected, selectedKey, styles]);

    return (
        <BottomSheet
            ref={ref}
            snapPoints={SNAP_POINTS}
            index={-1}
            enableDynamicSizing={false}
            enablePanDownToClose
            handleIndicatorStyle={styles.handleIndicator}
            onClose={onClose}
            onChange={onChange}
            backgroundStyle={styles.bottomSheetBackground}
        >
            <BottomSheetFlatList
                data={data}
                keyExtractor={getOptionKey}
                ItemSeparatorComponent={OptionSeparator}
                renderItem={renderItem}
                contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom }]}
            />
        </BottomSheet>
    );
}

function OptionSeparator() {
    return <View style={separatorStyle} />;
}

const separatorStyle = { height: 12 };

const createStyles = ({ scheme, settingsColors }: AppTheme) => StyleSheet.create({
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    handleIndicator: {
        width: 25,
        height: 5,
        borderRadius: 20,
        backgroundColor: scheme === "light" ? "#000000" : "#ffffff",
    },
    bottomSheetBackground: {
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        backgroundColor: settingsColors.screenBackground,
    },
    listItem: {
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: 'row',
        paddingVertical: 18,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: "#757575",
    },
    listItemText: {
        fontSize: 16,
        color: settingsColors.primaryText,
    },
});
