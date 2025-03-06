import React from 'react';
import { StyleSheet, Animated, Dimensions } from 'react-native';

export const SIDEBAR_WIDTH = Dimensions.get("window").width * 0.7;

type SideBarProps = {
    translationX: Animated.Value 
}

const SideBar: React.FC<SideBarProps> = ({translationX}) => {
    return (
        <Animated.View
            style={[
                styles.sideBar,
                {
                    transform: [{ translateX: Animated.add(-SIDEBAR_WIDTH, translationX) }],
                },
            ]}
        >

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
