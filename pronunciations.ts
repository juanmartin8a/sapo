import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
    listLanguages as listLanguagesHandler,
    listByLanguagePair as listByLanguagePairHandler,
} from "./model/pronunciations";

// Public, read-only: every language, sorted by display name.
export const listLanguages = query({
    args: {},
    handler: listLanguagesHandler,
});

// Public, read-only: paginated pronunciations for one source/target language pair.
export const listByLanguagePair = query({
    args: {
        sourceLanguageCode: v.string(),
        targetLanguageCode: v.string(),
        paginationOpts: paginationOptsValidator,
    },
    handler: listByLanguagePairHandler,
});
