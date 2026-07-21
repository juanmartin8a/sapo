import { describe, expect, it } from "@jest/globals";

import { createAbortableStream } from "../../model/sapopinguino/abortableStream";

function requireUpstreamSignal(signal: AbortSignal | null) {
    if (!signal) {
        throw new Error("Expected the stream to start upstream work");
    }

    return signal;
}

describe("abortable response streams", () => {
    it("aborts pending upstream work when the response body is cancelled", async () => {
        let upstreamSignal: AbortSignal | null = null;
        const stream = createAbortableStream<Uint8Array>(async (_controller, upstream) => {
            upstreamSignal = upstream.signal;
            await new Promise<void>((resolve) => {
                upstream.signal.addEventListener("abort", () => resolve(), { once: true });
            });
        });
        const response = new Response(stream);

        await response.body?.cancel();

        expect(requireUpstreamSignal(upstreamSignal).aborted).toBe(true);
    });
});
