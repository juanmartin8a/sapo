type BoundedRequestTextResult =
    | {
          ok: true;
          text: string;
      }
    | {
          ok: false;
          status: 400 | 413;
      };

type JsonRequestBodyResult<T> =
    | {
          ok: true;
          body: T;
      }
    | {
          ok: false;
          status: 400 | 413;
      };

function parseContentLength(value: string | null) {
    if (!value) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readBoundedRequestText(
    request: Request,
    maxBytes: number
): Promise<BoundedRequestTextResult> {
    const safeMaxBytes = Math.max(0, Math.floor(maxBytes));
    const contentLength = parseContentLength(request.headers.get("content-length"));

    if (contentLength !== null && contentLength > safeMaxBytes) {
        return {
            ok: false,
            status: 413,
        };
    }

    if (!request.body) {
        return {
            ok: true,
            text: "",
        };
    }

    if (typeof request.body.getReader !== "function") {
        if (contentLength === null) {
            return {
                ok: false,
                status: 413,
            };
        }

        let bodyBuffer: ArrayBuffer;

        try {
            bodyBuffer = await request.arrayBuffer();
        } catch {
            return {
                ok: false,
                status: 400,
            };
        }

        if (bodyBuffer.byteLength > safeMaxBytes) {
            return {
                ok: false,
                status: 413,
            };
        }

        return {
            ok: true,
            text: new TextDecoder().decode(bodyBuffer),
        };
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let text = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            bytesRead += value.byteLength;
            if (bytesRead > safeMaxBytes) {
                await reader.cancel().catch(() => null);
                return {
                    ok: false,
                    status: 413,
                };
            }

            text += decoder.decode(value, { stream: true });
        }

        text += decoder.decode();
    } catch {
        return {
            ok: false,
            status: 400,
        };
    }

    return {
        ok: true,
        text,
    };
}

export async function readBoundedJsonRequestBody<T>(
    request: Request,
    args: {
        maxBytes: number;
        emptyBody?: T;
    }
): Promise<JsonRequestBodyResult<T>> {
    const bodyResult = await readBoundedRequestText(request, args.maxBytes);

    if (!bodyResult.ok) {
        return bodyResult;
    }

    if (bodyResult.text.trim().length === 0 && "emptyBody" in args) {
        return {
            ok: true,
            body: args.emptyBody as T,
        };
    }

    try {
        return {
            ok: true,
            body: JSON.parse(bodyResult.text) as T,
        };
    } catch {
        return {
            ok: false,
            status: 400,
        };
    }
}
