import Home from "@/components/screens/Home";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import { StatusBar, View, Text } from "react-native";

export default function Index() {

    const { user } = useUser()

    return (
        <View>
            <SignedIn>
                <View
                    style={{
                        flex: 1,
                    }}
                >
                    <StatusBar barStyle="dark-content" />
                    <Home />
                </View>
            </SignedIn>
            <SignedOut>
                <View
                    style={{
                        width: 200,
                        height: 200,
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Link href="/(auth)/sign-in">
                        <Text>Sign in</Text>
                    </Link>
                    <Link href="/(auth)/sign-up">
                        <Text>Sign up</Text>
                    </Link>
                </View>
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
