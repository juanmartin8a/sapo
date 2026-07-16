import { isLocalModelDownloaded, LOCAL_TRANSLATION_MODELS, type LocalTranslationModelId } from "@/clients/local-model";
import useLocalModelStore from "@/stores/localModelStore";
import { useRouter } from "expo-router";
import { useRef } from "react";
import LangugeSelectorBottomSheetUI from "./LanguageSelectorBottomSheetUI";
import { triggerErrorHaptic, triggerSelectionHaptic } from "@/utils/haptics";
import useHomeBottomSheetController from "./useHomeBottomSheetController";
import { Alert } from "react-native";

const SHEET_KEY = "local_model_selector";

export default function LocalModelSelectorBottomSheet() {
    const router = useRouter();
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(SHEET_KEY);
    const isCheckingModelRef = useRef<boolean>(false);
    const selectedModelId = useLocalModelStore((state) => state.selectedModelId);
    const downloadedModelIds = useLocalModelStore((state) => state.downloadedModelIds);
    const selectModel = useLocalModelStore((state) => state.selectModel);
    const downloadedModelData = LOCAL_TRANSLATION_MODELS
        .filter((model) => downloadedModelIds.includes(model.id))
        .map((model) => [model.id, model.displayName] as [string, string]);

    const handleModelSelect = async (key: string) => {
        if (isCheckingModelRef.current) {
            return;
        }

        const modelId = key as LocalTranslationModelId;

        try {
            isCheckingModelRef.current = true;
            const isDownloaded = await isLocalModelDownloaded(modelId);

            if (!isDownloaded) {
                sheetRef.current?.close();
                router.push("/settings-modal/local-models");
                return;
            }

            if (modelId === selectedModelId) {
                return;
            }

            triggerSelectionHaptic();
            await selectModel(modelId);
        } catch (error) {
            if (__DEV__) {
                console.warn("Unable to select local model", error);
            }

            triggerErrorHaptic();
            Alert.alert("Unable to select model", "Please try again.");
        } finally {
            isCheckingModelRef.current = false;
        }
    }

    return (
        <LangugeSelectorBottomSheetUI
            selectedKey={selectedModelId ?? ""}
            ref={sheetRef}
            onLanguageSelected={handleModelSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={downloadedModelData}
        />
    );
}
