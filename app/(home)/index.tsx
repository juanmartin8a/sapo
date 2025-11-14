import Home from "@/components/screens/Home";
import AuthScreen from "@/components/screens/AuthScreen";
import { SignedIn, SignedOut } from "@clerk/clerk-expo";
import { StatusBar, View } from "react-native";

export default function Index() {
    return (
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <StatusBar barStyle="dark-content" />
            <SignedIn>
                <View
                    style={{
                        flex: 1,
                    }}
                >
                    <Home />
                </View>
            </SignedIn>
            <SignedOut>
                <AuthScreen />
            </SignedOut>
        </View>
    )
    // return (
    //     <View
    //         style={{
    //             flex: 1,
    //         }}
    //     >
    //         <StatusBar barStyle="dark-content" />
    //         <Home />
    //     </View>
    // );
}
