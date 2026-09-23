import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    languages: defineTable({
        language_code: v.string(),
        name: v.string(),
    })
        .index("by_language_code", ['language_code']),

    entries: defineTable({
        orthographic_form: v.string(),
        frequency: v.number(),
        language_id: v.id("languages"),
        language_code: v.string(),
    })
        .index("by_orth", ["orthographic_form"])
        .index("by_language_and_orth", ["language_code", "orthographic_form"]),

    phonetic_transcriptions: defineTable({
        entry_id: v.id("entries"),
        source_language_id: v.id("languages"),
        source_language_code: v.string(),
        target_language_id: v.id("languages"),
        target_language_code: v.string(),
        respelling: v.string(),
        ipa: v.string(),
    })
        .index("by_source_entry_target", ["source_language_code", "entry_id", "target_language_code"])
        .index("by_source_and_target", ["source_language_code", "target_language_code"]),

})
