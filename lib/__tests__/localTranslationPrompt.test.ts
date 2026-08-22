import { describe, expect, it } from "@jest/globals";

import {
    getTranslationPrompt,
    sanitizeLocalTranslationOutput,
} from "@/lib/local-translation.native";

describe("local translation prompt", () => {
    it("repeats the output constraint after the source text", () => {
        expect(getTranslationPrompt({
            inputLanguage: "Mandarin Chinese",
            targetLanguage: "English",
            input: "你好",
        })).toBe([
            "Translate from Mandarin Chinese to English.",
            "<text>",
            "你好",
            "</text>",
            "Return only the translation.",
        ].join("\n"));
    });

    it("uses a direct instruction when detecting the source language", () => {
        expect(getTranslationPrompt({
            inputLanguage: "Auto-detect",
            targetLanguage: "Spanish",
            input: "Hello",
        })).toContain("Detect the source language and translate to Spanish.");
    });

    it("removes a generated translation preface", () => {
        expect(sanitizeLocalTranslationOutput(
            "Here is the English translation for the provided text: Hello world.",
            "English"
        )).toBe("Hello world.");
    });
});
