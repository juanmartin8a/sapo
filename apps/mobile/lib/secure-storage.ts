import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

let storageQueue: Promise<void> = Promise.resolve();

async function canUseSecureStore() {
    return Platform.OS !== "web" && await SecureStore.isAvailableAsync();
}

export async function getSecureStorageItem(key: string): Promise<string | null> {
    return await canUseSecureStore() ? SecureStore.getItemAsync(key) : null;
}

function serializeStorageWrite(operation: () => Promise<void>) {
    const result = storageQueue.then(operation, operation);
    storageQueue = result.catch(() => undefined);
    return result;
}

export function setSecureStorageItem(key: string, value: string): Promise<void> {
    return serializeStorageWrite(async () => {
        if (await canUseSecureStore()) {
            await SecureStore.setItemAsync(key, value);
        }
    });
}

export function deleteSecureStorageItem(key: string): Promise<void> {
    return serializeStorageWrite(async () => {
        if (await canUseSecureStore()) {
            await SecureStore.deleteItemAsync(key);
        }
    });
}
