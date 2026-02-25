import { requireNativeModule } from "expo";
import { Platform } from "react-native";

let expoUiAvailable: boolean | undefined;

export function isExpoUiAvailable() {
    if (Platform.OS !== "ios") {
        return false;
    }

    if (expoUiAvailable !== undefined) {
        return expoUiAvailable;
    }

    try {
        requireNativeModule("ExpoUI");
        expoUiAvailable = true;
    } catch {
        expoUiAvailable = false;
    }

    return expoUiAvailable;
}
