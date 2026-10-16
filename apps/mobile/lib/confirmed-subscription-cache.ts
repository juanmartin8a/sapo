import {
    SUBSCRIPTION_PLAN_KEYS,
    type SubscriptionPlanKey,
} from "@/constants/subscription";
import {
    deleteSecureStorageItem,
    getSecureStorageItem,
    setSecureStorageItem,
} from "@/lib/secure-storage";

const CONFIRMED_SUBSCRIPTION_CACHE_KEY = "sapo.confirmed-subscription.v1";
const CACHE_VERSION = 1;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;

export type ConfirmedSubscriptionSnapshot = {
    userId: string;
    status: "active" | "inactive";
    planKey: SubscriptionPlanKey;
    accessExpiresAtMs: number | null;
    confirmedAtMs: number;
};

type StoredConfirmedSubscriptionSnapshot = ConfirmedSubscriptionSnapshot & {
    version: typeof CACHE_VERSION;
};

function isPlanKey(value: unknown): value is SubscriptionPlanKey {
    return value === SUBSCRIPTION_PLAN_KEYS.FREE || value === SUBSCRIPTION_PLAN_KEYS.POLYGLOT;
}

export function parseConfirmedSubscriptionSnapshot(
    value: unknown
): StoredConfirmedSubscriptionSnapshot | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const snapshot = value as Record<string, unknown>;
    const isActive = snapshot.status === "active";
    const accessExpiresAtMs = snapshot.accessExpiresAtMs;

    if (
        snapshot.version !== CACHE_VERSION ||
        typeof snapshot.userId !== "string" ||
        snapshot.userId.length === 0 ||
        (snapshot.status !== "active" && snapshot.status !== "inactive") ||
        !isPlanKey(snapshot.planKey) ||
        typeof snapshot.confirmedAtMs !== "number" ||
        !Number.isFinite(snapshot.confirmedAtMs) ||
        (isActive &&
            (typeof accessExpiresAtMs !== "number" || !Number.isFinite(accessExpiresAtMs))) ||
        (!isActive && accessExpiresAtMs !== null)
    ) {
        return null;
    }

    return snapshot as StoredConfirmedSubscriptionSnapshot;
}

export async function loadConfirmedSubscriptionSnapshot(
    userId: string,
    nowMs = Date.now()
): Promise<ConfirmedSubscriptionSnapshot | null> {
    try {
        const storedValue = await getSecureStorageItem(CONFIRMED_SUBSCRIPTION_CACHE_KEY);
        if (!storedValue) {
            return null;
        }

        const snapshot = parseConfirmedSubscriptionSnapshot(JSON.parse(storedValue));
        if (!snapshot || snapshot.userId !== userId) {
            return null;
        }

        if (
            snapshot.status === "active" &&
            (nowMs >= snapshot.accessExpiresAtMs! ||
                nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < snapshot.confirmedAtMs)
        ) {
            return null;
        }

        const { version: _version, ...confirmedSnapshot } = snapshot;
        return confirmedSnapshot;
    } catch (error) {
        if (__DEV__) {
            console.warn("Failed to load confirmed subscription state", error);
        }
        return null;
    }
}

export function persistConfirmedSubscriptionSnapshot(
    snapshot: ConfirmedSubscriptionSnapshot
): Promise<void> {
    const storedSnapshot: StoredConfirmedSubscriptionSnapshot = {
        version: CACHE_VERSION,
        ...snapshot,
    };

    return setSecureStorageItem(
        CONFIRMED_SUBSCRIPTION_CACHE_KEY,
        JSON.stringify(storedSnapshot)
    ).catch((error) => {
        if (__DEV__) {
            console.warn("Failed to persist confirmed subscription state", error);
        }
    });
}

export function clearConfirmedSubscriptionSnapshot(): Promise<void> {
    return deleteSecureStorageItem(CONFIRMED_SUBSCRIPTION_CACHE_KEY).catch((error) => {
        if (__DEV__) {
            console.warn("Failed to clear confirmed subscription state", error);
        }
    });
}
