export const ANONYMOUS_USER_ID_PREFIX = "anonymous:";
export const ANONYMOUS_USER_HEADER = "X-SAPO-Anonymous-User-ID";

const anonymousUserIdPattern = new RegExp(
    `^${ANONYMOUS_USER_ID_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
    "i"
);

export function isAnonymousUserId(value: string) {
    return anonymousUserIdPattern.test(value);
}

export function parseAnonymousUserId(value: string | null | undefined) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmedValue = value.trim();
    return isAnonymousUserId(trimmedValue) ? trimmedValue : null;
}
