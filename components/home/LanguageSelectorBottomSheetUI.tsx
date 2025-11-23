import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Text, TouchableOpacity } from "react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckIcon from "@/assets/icons/check.svg";
import React from "react";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";

interface LangugeSelectorBottomSheetUIProps {
    ref: React.RefObject<BottomSheetMethods | null>;
    data: ([string, string])[];
    selectedIndex: number;
    onClose: () => void;
    onChange: (index: number) => void;
    onLanguageSelected: (key: string) => void;
}

// UI component for SourceLanguageSelectorBottomSheet.tsx and targetLanguageSelectorBottomSheet.tsx

const LangugeSelectorBottomSheetUI = ({ ref, data, selectedIndex, onClose, onChange, onLanguageSelected }: LangugeSelectorBottomSheetUIProps) => {
    const insets = useSafeAreaInsets();

    return (
        <BottomSheet
            ref={ref}
            snapPoints={["45%", "65%"]}
            index={-1}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            handleIndicatorStyle={styles.handleIndicator}
            onClose={onClose}
            onChange={onChange}
            style={styles.bottomSheet}
            backgroundStyle={styles.bottomSheetBackground}
        >
            <BottomSheetFlatList
                data={data}
                keyExtractor={([key]) => key}
                ItemSeparatorComponent={() => <View style={{ height: 12 }}></View>}
                renderItem={({ item: [key, value] }) => {
                    const index = parseInt(key);
                    const isSelected = index === selectedIndex;

                    return (
                        <TouchableOpacity
                            style={styles.listItem}
                            onPress={() => onLanguageSelected(key)}
                            activeOpacity={0.65}
                        >
                            <Text style={styles.listItemText}>{value}</Text>
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
    bottomSheet: {
        shadowColor: "#aaa",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
    },
    handleIndicator: {
        backgroundColor: 'white',
        width: 25,
        height: 5,
        borderRadius: 20,
    },
    bottomSheetBackground: {
        backgroundColor: "black",
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
        borderColor: 'white',
    },
    listItemText: {
        fontSize: 16,
        color: 'white',
    }
})

export default LangugeSelectorBottomSheetUI;
