import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type MockEngine = {
    close: jest.MockedFunction<() => void>;
    loadModel: jest.MockedFunction<(modelPath: string) => Promise<void>>;
};

type PendingLoad = {
    engine: MockEngine;
    modelPath: string | null;
    resolve: () => void;
};

let mockSelectedModelId: "gemma4-e2b-it" | "gemma4-e4b-it" | null;
let mockPendingLoads: PendingLoad[];

const mockCreateLLM = jest.fn(() => {
    let resolveLoad: () => void = () => {};
    const loadPromise = new Promise<void>((resolve) => {
        resolveLoad = resolve;
    });
    const engine: MockEngine = {
        close: jest.fn(),
        loadModel: jest.fn<(modelPath: string) => Promise<void>>((modelPath: string) => {
            const pendingLoad = mockPendingLoads.find((item) => item.engine === engine);
            if (pendingLoad) {
                pendingLoad.modelPath = modelPath;
            }
            return loadPromise;
        }),
    };

    mockPendingLoads.push({
        engine,
        modelPath: null,
        resolve: resolveLoad,
    });
    return engine;
});

jest.mock("@/clients/local-model", () => ({
    getLocalModelFileUri: (modelId: string) => `file:///models/${modelId}.litertlm`,
    getSelectedLocalTranslationModel: () => (
        mockSelectedModelId ? { id: mockSelectedModelId } : null
    ),
    isLocalModelDownloaded: async () => true,
    isLocalModelSupported: () => true,
}));

jest.mock("react-native-litert-lm", () => ({
    createLLM: mockCreateLLM,
}));

const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (predicate()) {
            return;
        }

        await Promise.resolve();
    }

    throw new Error("Condition was not reached");
};

type ModelClient = typeof import("@/clients/local-translation.native");

const loadModelClient = () => {
    let modelClient!: ModelClient;

    jest.isolateModules(() => {
        modelClient = jest.requireActual<ModelClient>("@/clients/local-translation.native");
    });

    return modelClient;
};

describe("local translation model loading", () => {
    beforeEach(() => {
        jest.resetModules();
        mockCreateLLM.mockClear();
        mockPendingLoads = [];
        mockSelectedModelId = null;
    });

    it("serializes loads and publishes only the latest explicit request", async () => {
        const modelClient = loadModelClient();
        const loadA = modelClient.ensureLocalTranslationModelLoaded("gemma4-e2b-it");

        await waitFor(() => mockPendingLoads.length === 1);
        const firstLoad = mockPendingLoads[0];
        const loadB = modelClient.ensureLocalTranslationModelLoaded("gemma4-e4b-it");

        expect(mockPendingLoads).toHaveLength(1);

        firstLoad.resolve();
        await waitFor(() => mockPendingLoads.length === 2);

        expect(firstLoad.engine.close).toHaveBeenCalledTimes(1);
        expect(mockPendingLoads[1].modelPath).toContain("gemma4-e4b-it");

        mockPendingLoads[1].resolve();
        await Promise.all([loadA, loadB]);

        expect(modelClient.getLoadedLocalTranslationModelId()).toBe("gemma4-e4b-it");
        expect(mockPendingLoads[1].engine.close).not.toHaveBeenCalled();
    });

    it("closes an in-progress candidate when release is requested", async () => {
        const modelClient = loadModelClient();
        const load = modelClient.ensureLocalTranslationModelLoaded("gemma4-e2b-it");

        await waitFor(() => mockPendingLoads.length === 1);
        const pendingLoad = mockPendingLoads[0];
        const release = modelClient.releaseLocalTranslationModel();

        pendingLoad.resolve();
        await Promise.all([load, release]);

        expect(pendingLoad.engine.close).toHaveBeenCalledTimes(1);
        expect(modelClient.getLoadedLocalTranslationModelId()).toBeNull();
    });

    it("blocks a later load until an exclusive model operation finishes", async () => {
        const modelClient = loadModelClient();
        const loadA = modelClient.ensureLocalTranslationModelLoaded("gemma4-e2b-it");

        await waitFor(() => mockPendingLoads.length === 1);
        const firstLoad = mockPendingLoads[0];
        let finishOperation: () => void = () => {};
        const operationWait = new Promise<void>((resolve) => {
            finishOperation = resolve;
        });
        const exclusiveOperation = modelClient.runWithLocalTranslationModelReleased(
            "gemma4-e2b-it",
            () => operationWait
        );

        firstLoad.resolve();
        await waitFor(() => firstLoad.engine.close.mock.calls.length === 1);

        const loadB = modelClient.ensureLocalTranslationModelLoaded("gemma4-e4b-it");
        expect(mockPendingLoads).toHaveLength(1);

        finishOperation();
        await waitFor(() => mockPendingLoads.length === 2);
        mockPendingLoads[1].resolve();
        await Promise.all([loadA, exclusiveOperation, loadB]);

        expect(modelClient.getLoadedLocalTranslationModelId()).toBe("gemma4-e4b-it");
    });
});
