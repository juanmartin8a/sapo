import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import useTranslationStore from "../translationStore";
import useTransformationOperationStore from "../transformationOperationStore";
import useLanguageSelectionStore from "../languageSelectionStore";
import { runTranslationStream, type TranslationStreamCallbacks } from "@/lib/translation-stream";

jest.mock("@/lib/auth-client", () => ({ getConvexAccessTokenWithUserId: jest.fn() }));
jest.mock("@/lib/client-config", () => ({ CONVEX_SITE_URL: "https://example.test" }));
jest.mock("@/lib/translation-stream", () => ({
    getTranslationStreamEndpointPath: () => "/respell",
    runTranslationStream: jest.fn(),
}));

const initialState = useTranslationStore.getState();
const mockStream = jest.mocked(runTranslationStream);
let callbacks: TranslationStreamCallbacks;
let finish: () => void;
beforeEach(() => {
    jest.useFakeTimers();
    useTransformationOperationStore.setState({ operation: "respell", translateThenRespell: true });
    useLanguageSelectionStore.setState({ selectedIndex0: 0, selectedIndex1: 6, respellLanguage: "Source" });
    mockStream.mockImplementation((_args, handlers) => {
        callbacks = handlers;
        return new Promise(resolve => { finish = () => resolve({ type: "completed" }); });
    });
});
afterEach(() => {
    useTranslationStore.getState().disconnectStream();
    useTranslationStore.setState(initialState);
    useTransformationOperationStore.setState({ operation: "translate", translateThenRespell: false });
    jest.useRealTimers();
    jest.clearAllMocks();
});

describe("combined translation display", () => {
    it("keeps the mouth still for preview and animates only respell words", async () => {
        const request = useTranslationStore.getState().sendMessage("Hello");
        callbacks.onToken({ type: "translation_preview", value: "こんにちは" });
        jest.advanceTimersByTime(32);
        expect(useTranslationStore.getState()).toMatchObject({
            translationPreview: "こんにちは", displayText: "", isCombinedResponse: true,
            isTranslatingPreview: true, mouthTriggerVersion: initialState.mouthTriggerVersion,
        });
        callbacks.onToken({ type: "respell_start" });
        callbacks.onToken({ type: "word", input: "こんにちは", output: "konnichiwa" });
        jest.advanceTimersByTime(32);
        expect(useTranslationStore.getState()).toMatchObject({
            translationPreview: "こんにちは", displayText: "konnichiwa", isTranslatingPreview: false,
            mouthTriggerVersion: initialState.mouthTriggerVersion + 1,
        });
        finish();
        await request;
        expect(useTranslationStore.getState().isStreaming).toBe(false);
    });

    it("clears old results for a new request and ignores late tokens after cancellation", async () => {
        useTranslationStore.setState({ translationPreview: "old", displayText: "old result" });
        const request = useTranslationStore.getState().sendMessage("New");
        expect(useTranslationStore.getState()).toMatchObject({ translationPreview: "", displayText: "" });
        useTranslationStore.getState().stopStream();
        expect(callbacks.onToken({ type: "translation_preview", value: "late" })).toBe("stop");
        finish();
        await request;
        expect(useTranslationStore.getState().translationPreview).toBe("");
    });
});
