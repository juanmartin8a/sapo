import Home from "@/components/screens/Home";
import { StatusBar, View } from "react-native";

export default function Index() {
    return (
        <View
            style={{
                flex: 1,
            }}
        >
            <StatusBar barStyle="dark-content" />
            <Home />
        </View>
    );
}
