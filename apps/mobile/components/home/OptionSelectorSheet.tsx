import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckIcon from "@/assets/icons/check.svg";
import type { RefObject } from "react";
import { useAppTheme } from "@/providers/AppThemeProvider";

interface OptionSelectorSheetProps {
    ref: RefObject<BottomSheet | null>;
    data: ([string, string])[];
    selectedKey: string;
    onClose: () => void;
    onChange: (index: number) => void;
    onItemSelected: (key: string) => void;
    blackInLightMode?: boolean;
}

const OptionSelectorSheet = ({ ref, data, selectedKey, onClose, onChange, onItemSelected, blackInLightMode = false }: OptionSelectorSheetProps) => {
    const { scheme, settingsColors } = useAppTheme();
    const useBlackSheet = blackInLightMode && scheme === "light";
    const sheetColors = {
        background: useBlackSheet ? "#000000" : settingsColors.screenBackground,
        text: useBlackSheet ? "#ffffff" : settingsColors.primaryText,
        border: useBlackSheet ? "#ffffff" : "#757575",
        handle: scheme === "light" && !useBlackSheet ? "#000000" : "#ffffff",
    };
    const insets = useSafeAreaInsets();
    return (
        <BottomSheet
            ref={ref}
            snapPoints={["45%", "65%"]}
            index={-1}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            handleIndicatorStyle={[
                styles.handleIndicator,
                { backgroundColor: sheetColors.handle },
            ]}
            onClose={onClose}
            onChange={onChange}
            backgroundStyle={[
                styles.bottomSheetBackground,
                { backgroundColor: sheetColors.background },
            ]}
        >
            <BottomSheetFlatList
                data={data}
                keyExtractor={(item: [string, string]) => item[0]}
                ItemSeparatorComponent={() => <View style={{ height: 12 }}></View>}
                renderItem={({ item }: { item: [string, string] }) => {
                    const [key, value] = item;
                    const isSelected = key === selectedKey;

                    return (
                        <TouchableOpacity
                            style={[
                                styles.listItem,
                                { borderColor: sheetColors.border },
                            ]}
                            onPress={() => onItemSelected(key)}
                            activeOpacity={0.65}
                        >
                            <Text style={[styles.listItemText, { color: sheetColors.text }]}>{value}</Text>
                            {isSelected && <CheckIcon height={16 * 1.2} stroke="pink" />}
                        </TouchableOpacity>
                    );
                }}
                contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom, paddingTop: 12 }]}
            />

        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        paddingHorizontal: 24,
    },
    handleIndicator: {
        width: 25,
        height: 5,
        borderRadius: 20,
    },
    bottomSheetBackground: {
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
    },
    listItem: {
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: 'row',
        paddingVertical: 18,
        paddingHorizontal: 12,
        borderWidth: 1,
    },
    listItemText: {
        fontSize: 16,
    }
})

export default OptionSelectorSheet;
