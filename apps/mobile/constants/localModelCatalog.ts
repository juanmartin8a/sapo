import type {
    LocalTranslationModel,
    LocalTranslationModelId,
    SelectedLocalTranslationModelId,
} from "@/types/localModels";
import { LOCAL_TRANSLATION_MODEL_IDS } from "@/constants/localModels";

const GEMMA_4_E2B_DOWNLOAD = {
    repository: "litert-community/gemma-4-E2B-it-litert-lm",
    revision: "361a4010ad6d88fc5c86e148e333c0342b99763d",
    fileName: "gemma-4-E2B-it.litertlm",
} as const;
const GEMMA_4_E4B_DOWNLOAD = {
    repository: "litert-community/gemma-4-E4B-it-litert-lm",
    revision: "f7ad3343bd6ebc9607f4dc3bc4f2398bd5749bc5",
    fileName: "gemma-4-E4B-it.litertlm",
} as const;

function getHuggingFaceDownloadUrl(download: {
    repository: string;
    revision: string;
    fileName: string;
}) {
    return `https://huggingface.co/${download.repository}/resolve/${download.revision}/${download.fileName}`;
}

export const LOCAL_TRANSLATION_MODELS = [
    {
        id: LOCAL_TRANSLATION_MODEL_IDS.GEMMA_4_E2B_IT,
        displayName: "Gemma 4 e2b",
        fileName: GEMMA_4_E2B_DOWNLOAD.fileName,
        revision: GEMMA_4_E2B_DOWNLOAD.revision,
        sizeBytes: 2_588_147_712,
        sha256: "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
        xetHash: "ee3c29acd58e68bea04006a144cd2e40b3b34dcf5c08200a013744c518b15115",
        downloadUrl: getHuggingFaceDownloadUrl(GEMMA_4_E2B_DOWNLOAD),
    },
    {
        id: LOCAL_TRANSLATION_MODEL_IDS.GEMMA_4_E4B_IT,
        displayName: "Gemma 4 e4b",
        fileName: GEMMA_4_E4B_DOWNLOAD.fileName,
        revision: GEMMA_4_E4B_DOWNLOAD.revision,
        sizeBytes: 3_659_530_240,
        sha256: "0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0",
        xetHash: "7301453651814b29d434ca0d341e365e0e28dc811cb764d836995cae25b37f31",
        downloadUrl: getHuggingFaceDownloadUrl(GEMMA_4_E4B_DOWNLOAD),
    },
] as const satisfies readonly LocalTranslationModel[];

export const DEFAULT_LOCAL_TRANSLATION_MODEL_ID: SelectedLocalTranslationModelId = null;
const LOCAL_TRANSLATION_MODEL = LOCAL_TRANSLATION_MODELS[0];

export const getLocalTranslationModelById = (modelId: LocalTranslationModelId) => {
    return LOCAL_TRANSLATION_MODELS.find((model) => model.id === modelId) ?? LOCAL_TRANSLATION_MODEL;
};
