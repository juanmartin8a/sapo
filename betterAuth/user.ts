function readBooleanCandidate(candidate: unknown) {
    return candidate === true;
}

export function resolveBetterAuthUserId(user: unknown): string | null {
    const candidates: unknown[] = [];

    if (typeof user === "object" && user !== null) {
        const record = user as Record<string, unknown>;
        candidates.push(record._id);
        candidates.push(record.userId);
        candidates.push(record.id);

        if (typeof record.user === "object" && record.user !== null) {
            const nestedUser = record.user as Record<string, unknown>;
            candidates.push(nestedUser.id);
            candidates.push(nestedUser.userId);
        }
    }

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate;
        }
    }

    return null;
}

export function isBetterAuthUserAnonymous(user: unknown) {
    if (typeof user !== "object" || user === null) {
        return false;
    }

    const record = user as Record<string, unknown>;
    if (readBooleanCandidate(record.isAnonymous)) {
        return true;
    }

    if (typeof record.user === "object" && record.user !== null) {
        const nestedUser = record.user as Record<string, unknown>;
        return readBooleanCandidate(nestedUser.isAnonymous);
    }

    return false;
}
