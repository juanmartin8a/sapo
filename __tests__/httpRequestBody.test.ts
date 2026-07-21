import { describe, expect, it, jest } from "@jest/globals";

import { readBoundedJsonRequestBody } from "../model/http/requestBody";

describe("bounded HTTP request bodies", () => {
    it("reads valid JSON within the byte limit", async () => {
        await expect(
            readBoundedJsonRequestBody(
                new Request("https://example.com", {
                    method: "POST",
                    body: JSON.stringify({ ok: true }),
                }),
                {
                    maxBytes: 64,
                }
            )
        ).resolves.toEqual({
            ok: true,
            body: {
                ok: true,
            },
        });
    });

    it("rejects streaming bodies once the byte limit is exceeded", async () => {
        await expect(
            readBoundedJsonRequestBody(
                new Request("https://example.com", {
                    method: "POST",
                    body: JSON.stringify({ padding: "x".repeat(128) }),
                }),
                {
                    maxBytes: 32,
                }
            )
        ).resolves.toEqual({
            ok: false,
            status: 413,
        });
    });

    it("supports an explicit empty-body fallback", async () => {
        await expect(
            readBoundedJsonRequestBody(
                new Request("https://example.com", {
                    method: "POST",
                    body: "",
                }),
                {
                    maxBytes: 32,
                    emptyBody: {},
                }
            )
        ).resolves.toEqual({
            ok: true,
            body: {},
        });
    });

    it("rejects non-streaming bodies without content length before reading", async () => {
        const arrayBuffer = jest.fn(async () => new ArrayBuffer(128));

        await expect(
            readBoundedJsonRequestBody(
                {
                    headers: new Headers(),
                    body: {},
                    arrayBuffer,
                } as unknown as Request,
                {
                    maxBytes: 32,
                }
            )
        ).resolves.toEqual({
            ok: false,
            status: 413,
        });
        expect(arrayBuffer).not.toHaveBeenCalled();
    });
});
