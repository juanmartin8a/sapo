export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

export function parseString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function parseTimestampMs(value: unknown): number | null {
    const numberTimestamp = parseFiniteNumber(value);
    if (numberTimestamp !== null) {
        return numberTimestamp;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export function parseIdentifierString(value: unknown) {
    const parsedString = parseString(value);
    if (parsedString) {
        return parsedString;
    }

    const parsedNumber = parseFiniteNumber(value);
    return parsedNumber === null ? null : String(parsedNumber);
}
