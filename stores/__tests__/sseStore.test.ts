import { afterEach, describe, expect, it, jest } from "@jest/globals";
import useSseStore from "../sseStore";

jest.mock("@/clients/auth-client", () => ({
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
        useSseStore.setState(initialState);
    });

    it.each(["stopStream", "disconnectStream", "reset"] as const)(
        "%s aborts the active remote request without a separate stop request",
        (action) => {
            const abortController = new AbortController();
            useSseStore.setState({
                abortController,
                activeStreamId: "stream_1",
                isStreaming: true,
            });

            useSseStore.getState()[action]();

            expect(abortController.signal.aborted).toBe(true);
        }
    );
});
