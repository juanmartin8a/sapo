import { describe, expect, it } from "@jest/globals";

import { closeStreamOutput, tryEnqueueStreamOutput } from "../streamOutput";

describe("stream output", () => {
    it("does not throw when a disconnected client rejects an output write", () => {
        const controller = {
            enqueue: () => {
                throw new TypeError("stream is closed");
            },
        } as unknown as ReadableStreamDefaultController<Uint8Array>;

        expect(tryEnqueueStreamOutput(controller, new TextEncoder(), "error")).toBe(false);
    });

    it("does not throw when a disconnected client has already closed the stream", () => {
        const controller = {
            close: () => {
                throw new TypeError("stream is closed");
            },
        } as unknown as ReadableStreamDefaultController<Uint8Array>;

        expect(() => closeStreamOutput(controller)).not.toThrow();
    });
});
