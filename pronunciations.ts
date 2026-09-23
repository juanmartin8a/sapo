import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

const MAX_PAGE_SIZE = 100;

// Public, read-only: every language, sorted by display name.
export const listLanguages = query({
    args: {},
    handler: async (ctx) => {
        const languages = await ctx.db.query("languages").collect();
        return languages
            .map(({ language_code, name }) => ({ language_code, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    },
});

// Public, read-only: paginated pronunciations for one source/target language pair.
export const listByLanguagePair = query({
    args: {
        sourceLanguageCode: v.string(),
        targetLanguageCode: v.string(),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const numItems = Math.min(Math.max(Math.floor(args.paginationOpts.numItems), 1), MAX_PAGE_SIZE);

        const result = await ctx.db
            .query("phonetic_transcriptions")
            .withIndex("by_source_and_target", (q) =>
                q
                    .eq("source_language_code", args.sourceLanguageCode)
                    .eq("target_language_code", args.targetLanguageCode),
            )
            .paginate({ ...args.paginationOpts, numItems });

        const page = await Promise.all(
            result.page.map(async (transcription) => {
                const entry = await ctx.db.get(transcription.entry_id);
                return {
                    _id: transcription._id,
                    orthographic_form: entry?.orthographic_form ?? "",
                    source_language_code: transcription.source_language_code,
                    target_language_code: transcription.target_language_code,
                    ipa: transcription.ipa,
                    respelling: transcription.respelling,
                };
            }),
        );

        return {
            page,
            isDone: result.isDone,
            continueCursor: result.continueCursor,
        };
    },
});
