import { describe, it, expect } from "@jest/globals";
import { TranslationPreviewParser } from "../model/sapopinguino/translationPreviewParser";

describe("incremental translation preview", () => {
    const translation = 'Hola "amigo"\\test\n\tこんにちは 😄';
    const json = JSON.stringify({ detectedSourceLanguage: "English", translation })
        .replace("😄", "\\ud83d\\ude04");
    it("decodes every possible two-chunk split without leaking JSON", () => {
        for (let i = 0; i <= json.length; i++) {
            const parser = new TranslationPreviewParser();
            expect(parser.consume(json.slice(0, i)) + parser.consume(json.slice(i))).toBe(translation);
        }
    });
    it("streams character-sized chunks including escaped surrogate pairs", () => {
        const parser = new TranslationPreviewParser();
        expect(json.split("").map(c => parser.consume(c)).join("")).toBe(translation);
    });
    it("handles field ordering and braces inside translation text", () => {
        const parser = new TranslationPreviewParser();
        expect(parser.consume(JSON.stringify({ translation: 'a } { "translation": b', detectedSourceLanguage: "English" })))
            .toBe('a } { "translation": b');
    });
    it("rejects invalid escapes", () => {
        expect(() => new TranslationPreviewParser().consume('{"translation":"\\q"}')).toThrow();
    });
});
