import { describe, expect, it } from "@jest/globals";

import {
    isValidSapopinguinoStreamId,
    readSapopinguinoJsonRequestBody,
    sanitizeSapopinguinoInputPayload,
} from "../model/sapopinguino/input";

describe("sapopinguino input sanitization", () => {
    it("keeps only the prompt fields used by the app", () => {
        expect(
            sanitizeSapopinguinoInputPayload(
                JSON.stringify({
                    input_language: "English",
                    target_language: "Spanish",
                    input: "hello",
                    padding: "x".repeat(1_000),
                })
            )
        ).toEqual({
            payload: JSON.stringify({
                input_language: "English",
                target_language: "Spanish",
                input: "hello",
            }),
            userInput: "hello",
        });
    });

    it("charges plain text as the entire payload", () => {
        expect(sanitizeSapopinguinoInputPayload("hello")).toEqual({
            payload: "hello",
            userInput: "hello",
        });
    });

    it("rejects empty app input and oversized stream ids", () => {
        expect(sanitizeSapopinguinoInputPayload(JSON.stringify({ input: "" }))).toBeNull();
        expect(isValidSapopinguinoStreamId("a".repeat(128))).toBe(true);
        expect(isValidSapopinguinoStreamId("a".repeat(129))).toBe(false);
    });

    it("accepts the paid translation request limit", () => {
        const input = "a".repeat(10_000);

        expect(
            sanitizeSapopinguinoInputPayload(JSON.stringify({
                input_language: "English",
                target_language: "Spanish",
                input,
            }))
        ).toMatchObject({ userInput: input });
    });

    it("rejects non-object and oversized JSON request bodies", async () => {
        await expect(
            readSapopinguinoJsonRequestBody(
                new Request("https://example.com", {
                    method: "POST",
                    body: "null",
                })
            )
        ).resolves.toEqual({
            ok: false,
            status: 400,
        });

        await expect(
            readSapopinguinoJsonRequestBody(
                new Request("https://example.com", {
                    method: "POST",
                    headers: {
                        "content-length": "131073",
                    },
                    body: JSON.stringify({ input: "hello" }),
                })
            )
        ).resolves.toEqual({
            ok: false,
            status: 413,
        });
    });
});
