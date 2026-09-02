import { isRecord, readBoundedJsonRequestBody } from "../http/requestBody";

const MAX_SAPOPINGUINO_REQUEST_BODY_BYTES = 131_072;
const MAX_SAPOPINGUINO_INPUT_PAYLOAD_CHARS = 65_536;
const MAX_SAPOPINGUINO_STREAM_ID_CHARS = 128;
const MAX_LANGUAGE_LABEL_CHARS = 64;

type SanitizedSapopinguinoInput = {
    payload: string;
    userInput: string;
};

type SapopinguinoJsonBodyResult<T> =
    | {
          ok: true;
          body: T;
      }
    | {
          ok: false;
          status: 400 | 413;
      };

function readOptionalLanguageLabel(value: unknown) {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0 || Array.from(trimmedValue).length > MAX_LANGUAGE_LABEL_CHARS) {
        return null;
    }

    return trimmedValue;
}

export async function readSapopinguinoJsonRequestBody<T>(
    request: Request
): Promise<SapopinguinoJsonBodyResult<T>> {
    const bodyResult = await readBoundedJsonRequestBody<unknown>(request, {
        maxBytes: MAX_SAPOPINGUINO_REQUEST_BODY_BYTES,
    });

    if (!bodyResult.ok || !isRecord(bodyResult.body)) {
        return {
            ok: false,
            status: bodyResult.ok ? 400 : bodyResult.status,
        };
    }

    return {
        ok: true,
        body: bodyResult.body as T,
    };
}

export function isValidSapopinguinoStreamId(streamId: string) {
    return streamId.length > 0 && Array.from(streamId).length <= MAX_SAPOPINGUINO_STREAM_ID_CHARS;
}

export function sanitizeSapopinguinoInputPayload(
    inputPayload: string
): SanitizedSapopinguinoInput | null {
    if (
        inputPayload.length === 0 ||
        Array.from(inputPayload).length > MAX_SAPOPINGUINO_INPUT_PAYLOAD_CHARS
    ) {
        return null;
    }

    try {
        const parsedPayload = JSON.parse(inputPayload) as unknown;

        if (!isRecord(parsedPayload) || !("input" in parsedPayload)) {
            return {
                payload: inputPayload,
                userInput: inputPayload,
            };
        }

        if (typeof parsedPayload.input !== "string" || parsedPayload.input.length === 0) {
            return null;
        }

        const inputLanguage = readOptionalLanguageLabel(parsedPayload.input_language);
        const targetLanguage = readOptionalLanguageLabel(parsedPayload.target_language);

        if (inputLanguage === null || targetLanguage === null) {
            return null;
        }

        const sanitizedPayload = {
            ...(inputLanguage ? { input_language: inputLanguage } : {}),
            ...(targetLanguage ? { target_language: targetLanguage } : {}),
            input: parsedPayload.input,
        };

        return {
            payload: JSON.stringify(sanitizedPayload),
            userInput: parsedPayload.input,
        };
    } catch {
        return {
            payload: inputPayload,
            userInput: inputPayload,
        };
    }
}
