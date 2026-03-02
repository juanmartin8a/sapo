import { Children, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

interface GroupedListProps {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    backgroundColor?: string;
    borderRadius?: number;
    showDividers?: boolean;
    dividerColor?: string;
    dividerInset?: number;
}

const GroupedList = ({
    children,
    style,
    backgroundColor,
    borderRadius,
    showDividers = false,
    dividerColor = "#D4E0D1",
    dividerInset = 12,
}: GroupedListProps) => {
    const items = Children.toArray(children).filter((child) => typeof child !== "boolean");

    return (
        <View
            style={[
                styles.container,
                backgroundColor ? { backgroundColor } : null,
                borderRadius !== undefined ? { borderRadius } : null,
                style,
            ]}
        >
            {items.map((child, index) => {
                const isLastItem = index === items.length - 1;

                return (
                    <View key={index} style={styles.item}>
                        {child}
                        {showDividers && !isLastItem ? (
                            <View
                                style={[
                                    styles.divider,
                                    {
                                        backgroundColor: dividerColor,
                                        marginHorizontal: dividerInset,
                                    },
                                ]}
                            />
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: "100%",
        overflow: "hidden",
    },
    item: {
        width: "100%",
    },
    divider: {
        height: 1,
    },
});

export default GroupedList;
