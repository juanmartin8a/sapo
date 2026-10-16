import { afterEach, describe, expect, it, jest } from "@jest/globals";
import useTranslationStore from "../translationStore";

jest.mock("@/lib/auth-client", () => ({
    getConvexAccessTokenWithUserId: jest.fn(),
}));

const initialState = {
    displayText: "",
    streamError: false,
    streamErrorMessage: null,
    abortController: null,
    activeStreamId: null,
    activeLocalStop: null,
    isStreaming: false,
    lastInput: null,
};

describe("remote stream cancellation", () => {
    afterEach(() => {
        useTranslationStore.setState(initialState);
    });

    it.each(["stopStream", "disconnectStream"] as const)(
        "%s aborts the active remote request without a separate stop request",
        (action) => {
            const abortController = new AbortController();
            useTranslationStore.setState({
                abortController,
                activeStreamId: "stream_1",
                isStreaming: true,
            });

            useTranslationStore.getState()[action]();

            expect(abortController.signal.aborted).toBe(true);
        }
    );
});
