import { isLocalModelDownloaded } from "@/lib/local-model";
import { LOCAL_TRANSLATION_MODELS } from "@/constants/localModelCatalog";
import type { LocalTranslationModelId } from "@/types/localModels";
import { HOME_BOTTOM_SHEET_KEYS } from "@/constants/bottomSheets";
import { APP_ROUTES } from "@/constants/routes";
import useLocalModelStore from "@/stores/localModelStore";
import { useRouter } from "expo-router";
import { useRef } from "react";
import OptionSelectorSheet from "./OptionSelectorSheet";
import { triggerErrorHaptic, triggerSelectionHaptic } from "@/lib/haptics";
import useHomeBottomSheetController from "@/hooks/useHomeBottomSheetController";
import { Alert } from "react-native";

export default function LocalModelSelectorBottomSheet() {
    const router = useRouter();
    const { sheetRef, handleSheetClose, handleSheetChange } =
        useHomeBottomSheetController(HOME_BOTTOM_SHEET_KEYS.LOCAL_MODEL);
    const selectionRequestIdRef = useRef(0);
    const selectedModelId = useLocalModelStore((state) => state.selectedModelId);
    const downloadedModelIds = useLocalModelStore((state) => state.downloadedModelIds);
    const selectModel = useLocalModelStore((state) => state.selectModel);
    const downloadedModelData = LOCAL_TRANSLATION_MODELS
        .filter((model) => downloadedModelIds.includes(model.id))
        .map((model) => [model.id, model.displayName] as [string, string]);

    const handleModelSelect = async (key: string) => {
        const modelId = key as LocalTranslationModelId;
        const requestId = ++selectionRequestIdRef.current;

        try {
            const isDownloaded = await isLocalModelDownloaded(modelId);

            if (requestId !== selectionRequestIdRef.current) {
                return;
            }

            if (!isDownloaded) {
                sheetRef.current?.close();
                router.push(APP_ROUTES.LOCAL_MODELS);
                return;
            }

            if (modelId === useLocalModelStore.getState().selectedModelId) {
                return;
            }

            triggerSelectionHaptic();
            await selectModel(modelId);
        } catch (error) {
            if (requestId !== selectionRequestIdRef.current) {
                return;
            }

            if (__DEV__) {
                console.warn("Unable to select local model", error);
            }

            triggerErrorHaptic();
            Alert.alert("Unable to select model", "Please try again.");
        }
    }

    return (
        <OptionSelectorSheet
            selectedKey={selectedModelId ?? ""}
            ref={sheetRef}
            onItemSelected={handleModelSelect}
            onClose={handleSheetClose}
            onChange={handleSheetChange}
            data={downloadedModelData}
        />
    );
}
