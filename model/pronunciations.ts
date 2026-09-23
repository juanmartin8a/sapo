import type { PaginationOptions } from "convex/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

const MAX_PAGE_SIZE = 100;

export async function listLanguages(ctx: QueryCtx) {
    const languages = await ctx.db.query("languages").collect();
    return languages
        .map(({ language_code, name }) => ({ language_code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listByLanguagePair(
    ctx: QueryCtx,
    args: {
        sourceLanguageCode: string;
        targetLanguageCode: string;
        paginationOpts: PaginationOptions;
    }
) {
    if (!Number.isFinite(args.paginationOpts.numItems)) {
        throw new ConvexError("Page size must be finite");
    }
    const numItems = Math.min(Math.max(Math.floor(args.paginationOpts.numItems), 1), MAX_PAGE_SIZE);

    const result = await ctx.db
        .query("phonetic_transcriptions")
        .withIndex("by_source_and_target", (q) =>
            q
                .eq("source_language_code", args.sourceLanguageCode)
                .eq("target_language_code", args.targetLanguageCode)
        )
        .paginate({
            ...args.paginationOpts,
            numItems,
            // endCursor can override numItems during reactive pagination.
            maximumRowsRead: MAX_PAGE_SIZE,
        });

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
        })
    );

    return { ...result, page };
}
