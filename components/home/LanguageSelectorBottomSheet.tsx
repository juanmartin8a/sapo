import { languages, languagesPlusAutoDetect } from "@/constants/languages";
import useLanguageSelectorBottomSheetNotifier from '@/stores/languageSelectorBottomSheetNotifierStore';
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckIcon from "@/assets/icons/check.svg";


export default function LanguageSelectorBottomSheet() {
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const [ withAutoDetect, setWithAutoDetect ] = useState<boolean>(false);
    const withAutoDetectRef = useRef<boolean>(false); // ref to track current state
    const isClosed = useRef<boolean>(true)

    // boolean represents whether it should use open with auto-detect or without
    // null means that it should not reopen
    const shouldReopen = useRef<boolean | null>(null) 

    // Get the selectLanguage function from the store
    const selectLanguage = useLanguageSelectorBottomSheetNotifier(state => state.selectLanguage);

    // Update ref whenever state changes
    useEffect(() => {
        withAutoDetectRef.current = withAutoDetect;
    }, [withAutoDetect]);

    const bottomModalSheet = () => useLanguageSelectorBottomSheetNotifier.subscribe((state) => {
        if (isClosed.current) {
            setWithAutoDetect(state.withAutoDetect)
            sheetRef.current?.snapToIndex(0)
        } else {
            if (withAutoDetectRef.current !== state.withAutoDetect) {
                shouldReopen.current = state.withAutoDetect
                sheetRef.current?.close()
            }
        }
    })

    const handleClose = () => {
        if (shouldReopen.current !== null) {
            setWithAutoDetect(shouldReopen.current) 
            sheetRef.current?.snapToIndex(0)
            shouldReopen.current = null 
        }
        isClosed.current = true;
    }

    const handleChange = (index: number) => {
        if (index > -1) {
            isClosed.current = false;
        }    
    }

    const handleLanguageSelect = (key: string) => {
        const index = parseInt(key);
        selectLanguage(withAutoDetectRef.current, index);
        sheetRef.current?.close();
    }

    useEffect(() => {
        bottomModalSheet()
    }, [])

    return (
      <BottomSheet
        ref={sheetRef}
        snapPoints={["45%", "65%"]}
        index={-1}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        handleIndicatorStyle={styles.handleIndicator}
        onClose={handleClose}
        onChange={handleChange}
        style={styles.bottomSheet}
        backgroundStyle={styles.bottomSheetBackground}
      >
        <BottomSheetFlatList
          data={Object.entries(withAutoDetect ? languagesPlusAutoDetect : languages)}
          keyExtractor={([key]) => key}
          ItemSeparatorComponent={() => <View style={{height: 12}}></View>}
          renderItem={({ item: [key, value] }) => (
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => handleLanguageSelect(key)}
              activeOpacity={0.65}
            >
              <Text style={styles.listItemText}>{value}</Text>
            </TouchableOpacity>
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

