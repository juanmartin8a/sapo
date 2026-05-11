const MAX_SAPOPINGUINO_REQUEST_BODY_BYTES = 32_768;
const MAX_SAPOPINGUINO_INPUT_PAYLOAD_CHARS = 8_192;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export function isSapopinguinoRequestBodyTooLarge(request: Request) {
    const contentLength = request.headers.get("content-length");

    if (!contentLength) {
        return false;
    }

    const parsedContentLength = Number(contentLength);
    return (
        Number.isFinite(parsedContentLength) &&
        parsedContentLength > MAX_SAPOPINGUINO_REQUEST_BODY_BYTES
    );
}

export async function readSapopinguinoJsonRequestBody<T>(
    request: Request
): Promise<SapopinguinoJsonBodyResult<T>> {
    if (isSapopinguinoRequestBodyTooLarge(request)) {
        return {
            ok: false,
            status: 413,
        };
    }

    let requestText = "";

    if (request.body && typeof request.body.getReader === "function") {
        const reader = request.body.getReader();
        const decoder = new TextDecoder();
        let bytesRead = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                bytesRead += value.byteLength;
                if (bytesRead > MAX_SAPOPINGUINO_REQUEST_BODY_BYTES) {
                    await reader.cancel().catch(() => null);
                    return {
                        ok: false,
                        status: 413,
                    };
                }

                requestText += decoder.decode(value, { stream: true });
            }

            requestText += decoder.decode();
        } catch {
            return {
                ok: false,
                status: 400,
            };
        }
    } else {
        let bodyBuffer: ArrayBuffer;

        try {
            bodyBuffer = await request.arrayBuffer();
        } catch {
            return {
                ok: false,
                status: 400,
            };
        }

        if (bodyBuffer.byteLength > MAX_SAPOPINGUINO_REQUEST_BODY_BYTES) {
            return {
                ok: false,
                status: 413,
            };
        }

        requestText = new TextDecoder().decode(bodyBuffer);
    }

    try {
        const parsedBody = JSON.parse(requestText) as unknown;

        if (!isRecord(parsedBody)) {
            return {
                ok: false,
                status: 400,
            };
        }

        return {
            ok: true,
            body: parsedBody as T,
        };
    } catch {
        return {
            ok: false,
            status: 400,
        };
    }
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
