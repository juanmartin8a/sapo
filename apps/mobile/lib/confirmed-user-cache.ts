import {
    deleteSecureStorageItem,
    getSecureStorageItem,
    setSecureStorageItem,
} from "@/lib/secure-storage";

const CONFIRMED_USER_CACHE_KEY = "sapo.confirmed-user.v1";
const CACHE_VERSION = 1;

export type ConfirmedUserSnapshot = {
    userId: string;
    email: string;
};

type StoredConfirmedUserSnapshot = ConfirmedUserSnapshot & {
    version: typeof CACHE_VERSION;
};

export function parseConfirmedUserSnapshot(value: unknown): StoredConfirmedUserSnapshot | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const snapshot = value as Record<string, unknown>;
    if (
        snapshot.version !== CACHE_VERSION ||
        typeof snapshot.userId !== "string" ||
        snapshot.userId.length === 0 ||
        typeof snapshot.email !== "string" ||
        snapshot.email.length === 0
    ) {
        return null;
    }

    return snapshot as StoredConfirmedUserSnapshot;
}

export async function loadConfirmedUserSnapshot(
    userId: string
): Promise<ConfirmedUserSnapshot | null> {
    try {
        const storedValue = await getSecureStorageItem(CONFIRMED_USER_CACHE_KEY);
        if (!storedValue) {
            return null;
        }

        const snapshot = parseConfirmedUserSnapshot(JSON.parse(storedValue));
        if (!snapshot || snapshot.userId !== userId) {
            return null;
        }

        const { version: _version, ...confirmedUser } = snapshot;
        return confirmedUser;
    } catch (error) {
        if (__DEV__) {
            console.warn("Failed to load confirmed user", error);
        }
        return null;
    }
}

export function persistConfirmedUserSnapshot(snapshot: ConfirmedUserSnapshot): Promise<void> {
    const storedSnapshot: StoredConfirmedUserSnapshot = {
        version: CACHE_VERSION,
        ...snapshot,
    };

    return setSecureStorageItem(
        CONFIRMED_USER_CACHE_KEY,
        JSON.stringify(storedSnapshot)
    ).catch((error) => {
        if (__DEV__) {
            console.warn("Failed to persist confirmed user", error);
        }
    });
}

export function clearConfirmedUserSnapshot(): Promise<void> {
    return deleteSecureStorageItem(CONFIRMED_USER_CACHE_KEY).catch((error) => {
        if (__DEV__) {
            console.warn("Failed to clear confirmed user", error);
        }
    });
}
