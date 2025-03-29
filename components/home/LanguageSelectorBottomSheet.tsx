import { languages } from "@/constants/languages";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useRef } from "react";
import { Text } from "react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";


export default function LanguageSelectorBottomSheet() {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={["45%", "65%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        handleIndicatorStyle={styles.handleIndicator}
        style={styles.bottomSheet}
        backgroundStyle={styles.bottomSheetBackground}
      >
        <BottomSheetFlatList
          data={Object.entries(languages)}
          keyExtractor={(_, index) => index.toString()}
          ItemSeparatorComponent={() => <View style={{height: 12}}></View>}
          renderItem={({ item: [_, value] }) => (
            <View style={styles.listItem}>
              <Text style={styles.listItemText}>{value}</Text>
            </View>
          )}
          contentContainerStyle={[styles.contentContainer, {paddingBottom: insets.bottom, paddingTop: 12}]}
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
        shadowOffset: { width: 0, height: -4},
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
        paddingVertical: 18,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#EEEEEE',
    },
    listItemText: {
        fontSize: 16,
        color: 'white',
    }
})

