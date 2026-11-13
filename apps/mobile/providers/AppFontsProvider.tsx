import { TINOS } from "@/constants/fonts";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, type ReactNode } from "react";

SplashScreen.preventAutoHideAsync();

export default function AppFontsProvider({ children }: { children: ReactNode }) {
    const [loaded, error] = useFonts({
        [TINOS.regular]: require("@/assets/fonts/tinos/Tinos-Regular.ttf"),
        [TINOS.bold]: require("@/assets/fonts/tinos/Tinos-Bold.ttf"),
    });

    useEffect(() => {
        if (loaded || error) {
            void SplashScreen.hideAsync();
        }
        if (error) {
            throw error;
        }
    }, [loaded, error]);

    if (!loaded) {
        return null;
    }

    return children;
}
