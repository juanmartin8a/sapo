import { describe, expect, it, jest } from "@jest/globals";
import type { QueryCtx } from "../_generated/server";
import { listByLanguagePair } from "../model/pronunciations";

function createContext() {
    const paginate = jest.fn(async (_options: unknown) => ({
        page: [{
            _id: "transcription_1",
            entry_id: "entry_1",
            source_language_code: "en",
            target_language_code: "es",
            ipa: "həˈləʊ",
            respelling: "jelou",
        }],
        isDone: false,
        continueCursor: "next",
        splitCursor: "split",
        pageStatus: "SplitRequired" as const,
    }));
    const eq = jest.fn((_field: string, _value: string): unknown => ({ eq }));
    const withIndex = jest.fn((_name: string, range: (q: unknown) => unknown) => {
        range({ eq });
        return { paginate };
    });
    const query = jest.fn(() => ({ withIndex }));
    const get = jest.fn(async () => ({ orthographic_form: "hello", frequency: 1 }));
    const ctx = { db: { query, get } } as unknown as QueryCtx;
    return { ctx, paginate, query, eq };
}

describe("pronunciations pagination", () => {
    it("preserves split metadata and bounds reads even with a client-supplied end cursor", async () => {
        const { ctx, paginate, eq } = createContext();
        const result = await listByLanguagePair(ctx, {
            sourceLanguageCode: "en",
            targetLanguageCode: "es",
            paginationOpts: {
                cursor: null,
                endCursor: "end",
                numItems: 1000,
                maximumRowsRead: 10000,
            },
        });

        expect(eq.mock.calls).toEqual([
            ["source_language_code", "en"],
            ["target_language_code", "es"],
        ]);
        expect(paginate).toHaveBeenCalledWith({
            cursor: null,
            endCursor: "end",
            numItems: 100,
            maximumRowsRead: 100,
        });
        expect(result).toEqual({
            page: [{
                _id: "transcription_1",
                orthographic_form: "hello",
                source_language_code: "en",
                target_language_code: "es",
                ipa: "həˈləʊ",
                respelling: "jelou",
            }],
            isDone: false,
            continueCursor: "next",
            splitCursor: "split",
            pageStatus: "SplitRequired",
        });
    });

    it.each([NaN, Infinity, -Infinity])("rejects non-finite page size %s before database access", async (numItems) => {
        const { ctx, query } = createContext();
        await expect(listByLanguagePair(ctx, {
            sourceLanguageCode: "en",
            targetLanguageCode: "es",
            paginationOpts: { cursor: null, numItems },
        })).rejects.toThrow("Page size must be finite");
        expect(query).not.toHaveBeenCalled();
    });
});
