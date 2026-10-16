import { MAX_PERSISTED_ERROR_MESSAGE_CHARS } from "../constants/limits";

export function formatErrorMessage(error: unknown): string {
    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message.slice(0, MAX_PERSISTED_ERROR_MESSAGE_CHARS);
        }
    }

    return "Unknown error";
}
