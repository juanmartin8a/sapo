import { describe, expect, it, jest } from "@jest/globals";

import { sanitizeSapopinguinoInputPayload } from "../model/sapopinguino/input";
import {
    reserveSapopinguinoQuota,
    resolveSapopinguinoInputCharacterCount,
} from "../model/sapopinguino/quota";

describe("quota input accounting", () => {
    it("charges all user text even when that text contains a nested input field", async () => {
        const userText = JSON.stringify({ input: "x", text: "a".repeat(10_000) });
        const sanitized = sanitizeSapopinguinoInputPayload(JSON.stringify({
            input_language: "English",
            target_language: "Spanish",
            input: userText,
        }));
        expect(sanitized).not.toBeNull();
        const runMutation = jest.fn(async () => ({
            allowed: false,
            reason: "input_limit_exceeded",
        }));

        await expect(reserveSapopinguinoQuota({ runMutation } as never, {
            userId: "user_1",
            operation: "translate",
            input: sanitized!.userInput,
            streamId: "stream_1",
        })).resolves.toMatchObject({ status: "blocked", reason: "input_limit_exceeded" });
        expect(runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            input_char_count: Array.from(userText).length,
        }));
    });

    it.each(["Hello", "🐸你好", '{"input":""}', '{"input":"x"}'])("counts the actual text %s", (input) => {
        expect(resolveSapopinguinoInputCharacterCount(input)).toBe(Array.from(input).length);
    });
});
