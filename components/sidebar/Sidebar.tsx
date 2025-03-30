import React, {useState} from 'react';
import { StyleSheet, Animated, Dimensions, Text, View } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ChevronRightIcon from "../../assets/icons/chevron-right.svg";
import { GestureHandlerRootView, TouchableWithoutFeedback } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { Pressable } from 'react-native';
import useBottomSheetNotifier from '@/stores/bottomSheetNotifierStore';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.Value 
}

const SideBar: React.FC<SideBarProps> = ({ translationX }) => {
    const [open, setOpen] = useState(false)
    const insets = useSafeAreaInsets();
    const [selectedLanguage, setSelectedLanguage] = useState<string>();
    const showBottomSheet = useBottomSheetNotifier((state) => state.showBottomSheet)

    return (
        <Animated.View
            style={[
                styles.sideBar,
                {
                    transform: [{ translateX: Animated.add(-SIDEBAR_WIDTH, translationX) }],
                    paddingTop: insets.top
                },
            ]}
        >
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Input Language:</Text>
              <TouchableWithoutFeedback onPress={() => showBottomSheet(true)}>
                <View style={styles.field}>
                    <Text style={styles.textInField}>Auto Detect</Text>
                    <ChevronRightIcon stroke="#aaa"/>
                </View>
              </TouchableWithoutFeedback>
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Target Language:</Text>
              <TouchableWithoutFeedback onPress={() => showBottomSheet(false)}>
                <View style={styles.field}>
                    <Text style={styles.textInField}>Mandarin</Text>
                    <ChevronRightIcon height={24} stroke="#aaa"/>
                </View>
              </TouchableWithoutFeedback>
            </View>
            <BottomSheet
        // ref={bottomSheetRef}
        // onChange={handleSheetChanges}
      >
        <BottomSheetView style={{}}>
          <Text>Awesome 🎉</Text>
        </BottomSheetView>
      </BottomSheet>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    inputContainer: {
        paddingVertical: 12
    },
    label: {
        fontSize: 16,
        fontWeight: "500",
    },
    field: {
        width: "100%",
        height: 42,
        alignContent: 'space-around',
        justifyContent: 'center',
        alignItems: "center",
        flexDirection: "row",
        fontWeight: "bold",
    },
    textInField: {
        flex: 1,
        fontSize: 18,
        lineHeight: 18,
        color: "#aaa",
        fontWeight: "500",
    },
    sideBar: {
        position: "absolute",
        height: "100%",
        width: SIDEBAR_WIDTH,
        backgroundColor: "#f8f8f8",
        zIndex: 1,
        padding: 20,
        transform: [
            { translateX: -SIDEBAR_WIDTH }
        ]
    },
});

export default SideBar;
