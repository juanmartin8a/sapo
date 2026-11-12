import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { LOCAL_TRANSLATION_MODELS } from "@/constants/localModelCatalog";
import { createLocalModelDownload } from "@/lib/local-model.native";

const mockModel = LOCAL_TRANSLATION_MODELS[0];
const mockFiles = new Map<string, { size: number; text?: string }>();
const mockWrite = jest.fn<(uri: string, contents: string) => Promise<void>>();

jest.mock("expo-file-system", () => {
    class MockDirectory {
        uri = "file:///cache/local-models";
        create() {}
    }

    class MockFile {
        uri: string;

        constructor(parent: string | MockDirectory, name?: string) {
            this.uri = name ? `${typeof parent === "string" ? parent : parent.uri}/${name}` : String(parent);
        }

        get exists() { return mockFiles.has(this.uri); }
        get size() { return mockFiles.get(this.uri)?.size ?? 0; }
        get lastModified() { return this.exists ? 1_000 : null; }

        async text() {
            const contents = mockFiles.get(this.uri)?.text;
            if (contents === undefined) throw new Error("File not found");
            return contents;
        }

        write(contents: string) { return mockWrite(this.uri, contents); }
        delete() { mockFiles.delete(this.uri); }
        move(destination: MockFile) {
            mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
            this.delete();
        }

        static createDownloadTask(_url: string, destination: MockFile) {
            return {
                async downloadAsync() {
                    mockFiles.set(destination.uri, { size: mockModel.sizeBytes });
                    return destination;
                },
                release() {},
            };
        }
    }

    return {
        Directory: MockDirectory,
        File: MockFile,
        Paths: { cache: "file:///cache", availableDiskSpace: Number.MAX_SAFE_INTEGER },
    };
});

describe("local model download verification", () => {
    beforeEach(() => {
        mockFiles.clear();
        mockWrite.mockReset();
        jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, {
            headers: { "x-linked-etag": mockModel.sha256 },
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("waits for the verification record to persist before reporting a downloaded model", async () => {
        let finishWrite!: () => void;
        let markWriteStarted!: () => void;
        const writeStarted = new Promise<void>((resolve) => { markWriteStarted = resolve; });
        const pendingWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
        mockWrite.mockImplementation(async (uri, contents) => {
            markWriteStarted();
            await pendingWrite;
            mockFiles.set(uri, { size: contents.length, text: contents });
        });

        let settled = false;
        const result = createLocalModelDownload(jest.fn(), mockModel.id).start().then((status) => {
            settled = true;
            return status;
        });

        await writeStarted;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(settled).toBe(false);

        finishWrite();
        await expect(result).resolves.toMatchObject({ isDownloaded: true, downloadedBytes: mockModel.sizeBytes });
    });

    it("rejects the download when persisting its verification record fails", async () => {
        mockWrite.mockRejectedValue(new Error("Disk write failed"));

        await expect(createLocalModelDownload(jest.fn(), mockModel.id).start()).rejects.toThrow("Disk write failed");
    });
});
