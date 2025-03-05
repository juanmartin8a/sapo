import React, {useState} from 'react';
import { StyleSheet, Animated, Dimensions, Text } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker'

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.Value 
}

const SideBar: React.FC<SideBarProps> = ({ translationX }) => {
    const [open, setOpen] = useState(false)
    const [selectedLanguage, setSelectedLanguage] = useState<string>("en");
    const [items, setItems] = useState([
        { label: "English", value: "en" },
        { label: "Spanish", value: "es" },
        { label: "French", value: "fr" },
        { label: "German", value: "de" },
        { label: "Mandarin (Standard Chinese)", value: "zh" },
        { label: "Russian", value: "ru" },
        { label: "Portuguese", value: "pt" },
        { label: "Arabic", value: "ar" },
    ]);

    return (
        <Animated.View
            style={[
                styles.sideBar,
                {
                    transform: [{ translateX: Animated.add(-SIDEBAR_WIDTH, translationX) }],
                },
            ]}
        >
            <Text>Target Language:</Text>
            <DropDownPicker
                open={open}
                setOpen={setOpen}
                value={selectedLanguage}
                setValue={setSelectedLanguage}
                items={items}
                setItems={setItems}
                style={{ marginTop: 10 }}
            />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
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
