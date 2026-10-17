import assert from "node:assert/strict";
import { test } from "node:test";
import {
    parsePreferences,
    DEFAULT_PREFERENCES,
} from "../src/lib/preferences.ts";

test("restores supported language, operation, and phone layout preferences", () => {
    assert.deepEqual(
        parsePreferences({
            operation: "respell",
            sourceLanguage: "Spanish",
            targetLanguage: "Japanese",
            respellLanguage: "English",
            translateThenRespell: true,
            singleScreen: true,
        }),
        {
            operation: "respell",
            sourceLanguage: "Spanish",
            targetLanguage: "Japanese",
            respellLanguage: "English",
            translateThenRespell: true,
            singleScreen: true,
        },
    );
});

test("rejects unsupported preferences and ignores user text and entitlement claims", () => {
    assert.deepEqual(
        parsePreferences({
            operation: "local",
            sourceLanguage: "missing",
            targetLanguage: "Auto-detect",
            respellLanguage: "missing",
            translateThenRespell: "true",
            singleScreen: 1,
            input: "private text",
            displayText: "private result",
            hasActiveSubscription: true,
        }),
        DEFAULT_PREFERENCES,
    );
    assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
});
