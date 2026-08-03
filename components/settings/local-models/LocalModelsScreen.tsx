import { useCallback, useEffect, useRef, useState } from "react";
import { Column, FieldGroup, Text } from "@expo/ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { Alert, Platform } from "react-native";

import LocalModelRow from "@/components/settings/local-models/LocalModelRow";
import SettingsForm from "@/components/settings/ui/SettingsForm";
import {
    getLocalModelStatus,
    isLocalModelAbortError,
} from "@/lib/local-model";
import { LOCAL_TRANSLATION_MODELS } from "@/constants/localModelCatalog";
import type {
    LocalModelStatus,
    LocalTranslationModel,
    LocalTranslationModelId,
} from "@/types/localModels";
import { formatBytes } from "@/utils/formatBytes";
import {
    SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
    SETTINGS_COLORS,
} from "@/constants/settings";
import useLocalModelStore from "@/stores/localModelStore";
import { triggerErrorHaptic, triggerLightImpactHaptic } from "@/lib/haptics";

type ModelStatusById = Partial<Record<LocalTranslationModelId, LocalModelStatus>>;

const isIOS = Platform.OS === "ios";
const footnoteFontModifiers = isIOS ? [font({ textStyle: "footnote", weight: "regular" })] : undefined;

export default function LocalModelsScreen() {
    const [statusByModelId, setStatusByModelId] = useState<ModelStatusById>({});
    const [isRefreshing, setIsRefreshing] = useState(true);
    const [didStatusCheckFail, setDidStatusCheckFail] = useState(false);
    const mountedRef = useRef(true);
    const cancelDownload = useLocalModelStore((state) => state.cancelDownload);
    const downloadedModelIds = useLocalModelStore((state) => state.downloadedModelIds);
    const downloadProgressByModelId = useLocalModelStore((state) => state.downloadProgressByModelId);
    const downloadingModelId = useLocalModelStore((state) => state.downloadingModelId);
    const deletingModelId = useLocalModelStore((state) => state.deletingModelId);
    const deleteModel = useLocalModelStore((state) => state.deleteModel);
    const setDownloadedModelIds = useLocalModelStore((state) => state.setDownloadedModelIds);
    const selectedModelId = useLocalModelStore((state) => state.selectedModelId);
    const isLocalModelLoading = useLocalModelStore((state) => state.isLoading);
    const startDownload = useLocalModelStore((state) => state.startDownload);

    const refreshStatus = useCallback(async () => {
        if (mountedRef.current) {
            setIsRefreshing(true);
        }

        try {
            const nextStatuses = await Promise.all(
                LOCAL_TRANSLATION_MODELS.map(async (model) => [model.id, await getLocalModelStatus(model.id)] as const)
            );
            const nextStatusByModelId = Object.fromEntries(nextStatuses) as ModelStatusById;

            if (mountedRef.current) {
                setStatusByModelId(nextStatusByModelId);
                setDidStatusCheckFail(false);
            }

            await setDownloadedModelIds(
                LOCAL_TRANSLATION_MODELS
                    .filter((model) => nextStatusByModelId[model.id]?.isDownloaded)
                    .map((model) => model.id)
            );
        } catch {
            if (mountedRef.current) {
                setDidStatusCheckFail(true);
                triggerErrorHaptic();
                Alert.alert("Unable to check model", "Please try again.");
            }
        } finally {
            if (mountedRef.current) {
                setIsRefreshing(false);
            }
        }
    }, [setDownloadedModelIds]);

    useEffect(() => {
        mountedRef.current = true;
        const refreshTimeout = setTimeout(() => {
            void refreshStatus();
        }, 0);

        return () => {
            clearTimeout(refreshTimeout);
            mountedRef.current = false;
        };
    }, [refreshStatus]);

    const selectedStatus = selectedModelId ? statusByModelId[selectedModelId] : undefined;
    const firstStatus = LOCAL_TRANSLATION_MODELS.map((model) => statusByModelId[model.id]).find(Boolean);
    const availableBytes = selectedStatus?.availableBytes ?? firstStatus?.availableBytes;
    const localModelsSupported = Object.values(statusByModelId).some((status) => status?.supported);
    const isModelDownloaded = useCallback((modelId: LocalTranslationModelId) => {
        return statusByModelId[modelId]?.isDownloaded === true || downloadedModelIds.includes(modelId);
    }, [downloadedModelIds, statusByModelId]);
    const downloadedModels = LOCAL_TRANSLATION_MODELS.filter((model) => isModelDownloaded(model.id));
    const availableModels = LOCAL_TRANSLATION_MODELS.filter((model) => !isModelDownloaded(model.id));
    const hasStatuses = Object.keys(statusByModelId).length > 0;
    const deviceNote = isRefreshing && !hasStatuses
        ? "Checking model compatibility..."
        : didStatusCheckFail
          ? "Unable to determine local model support right now."
          : !localModelsSupported
            ? "Local models are available in the iOS and Android apps."
            : "Local translations run without network requests. Other SAPO features continue to use the online service.";

    const handleDownload = useCallback(async (model: LocalTranslationModel) => {
        if (downloadingModelId || deletingModelId === model.id || isLocalModelLoading) {
            return;
        }

        triggerLightImpactHaptic();

        try {
            const nextStatus = await startDownload(model.id);

            if (!nextStatus) {
                return;
            }

            if (mountedRef.current) {
                setStatusByModelId((current) => ({
                    ...current,
                    [model.id]: nextStatus,
                }));
            }

            Alert.alert(
                "Model downloaded",
                `${model.displayName} is ready for offline translations`
            );
        } catch (error) {
            if (mountedRef.current && !isLocalModelAbortError(error)) {
                if (__DEV__) {
                    console.warn("Local model download failed", error);
                }

                triggerErrorHaptic();
                Alert.alert(
                    "Download failed",
                    "Unable to download the local model. Please try again."
                );
            }

            await refreshStatus();
        }
    }, [deletingModelId, downloadingModelId, isLocalModelLoading, refreshStatus, startDownload]);

    const handleCancelDownload = useCallback(async () => {
        await cancelDownload();
        await refreshStatus();
    }, [cancelDownload, refreshStatus]);

    const handleDeleteModel = useCallback((model: LocalTranslationModel) => {
        if (
            deletingModelId ||
            downloadingModelId === model.id ||
            isLocalModelLoading ||
            !isModelDownloaded(model.id)
        ) {
            return;
        }

        Alert.alert(
            "Delete local model?",
            "Offline translations will stop working until you download the model again.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            triggerLightImpactHaptic();
                            await deleteModel(model.id);

                            if (mountedRef.current) {
                                setStatusByModelId((current) => {
                                    const currentStatus = current[model.id];

                                    return currentStatus
                                        ? {
                                            ...current,
                                            [model.id]: {
                                                ...currentStatus,
                                                isDownloaded: false,
                                                downloadedBytes: 0,
                                            },
                                        }
                                        : current;
                                });

                                try {
                                    const nextStatus = await getLocalModelStatus(model.id);

                                    if (mountedRef.current) {
                                        setStatusByModelId((current) => ({
                                            ...current,
                                            [model.id]: nextStatus,
                                        }));
                                    }
                                } catch {
                                    // The optimistic deleted status remains until the next screen refresh.
                                }
                            }

                        } catch {
                            triggerErrorHaptic();
                            Alert.alert("Unable to delete model", "Please try again.");
                        }
                    },
                },
            ]
        );
    }, [deleteModel, deletingModelId, downloadingModelId, isLocalModelLoading, isModelDownloaded]);

    const renderModelRow = (model: LocalTranslationModel) => {
        const status = statusByModelId[model.id];
        const isDownloaded = isModelDownloaded(model.id);
        const isDownloading = downloadingModelId === model.id;
        const isDeleting = deletingModelId === model.id;
        const hasConflictingOperation = isDownloading
            ? false
            : isDownloaded
              ? !!deletingModelId || downloadingModelId === model.id
              : !!downloadingModelId || deletingModelId === model.id;
        const isModelActionDisabled =
            isRefreshing || !status?.supported || isLocalModelLoading || hasConflictingOperation;

        return (
            <LocalModelRow
                key={model.id}
                model={model}
                status={status}
                progress={downloadProgressByModelId[model.id]}
                isDownloaded={isDownloaded}
                isDownloading={isDownloading}
                isDeleting={isDeleting}
                disabled={isModelActionDisabled}
                onDownload={() => {
                    void handleDownload(model);
                }}
                onCancelDownload={() => {
                    void handleCancelDownload();
                }}
                onDelete={() => {
                    handleDeleteModel(model);
                }}
            />
        );
    };

    const sectionFooter = (
        <Column spacing={12}>
            {availableBytes !== null && availableBytes !== undefined ? (
                <Text
                    modifiers={footnoteFontModifiers}
                    textStyle={{
                        color: SETTINGS_COLORS.mutedText,
                        fontSize: isIOS ? undefined : SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
                    }}
                >
                    {`${formatBytes(availableBytes)} available on this device`}
                </Text>
            ) : null}
            <Text
                modifiers={footnoteFontModifiers}
                textStyle={{
                    color: SETTINGS_COLORS.mutedText,
                    fontSize: isIOS ? undefined : SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
                    lineHeight: isIOS ? undefined : 18,
                }}
            >
                {deviceNote}
            </Text>
        </Column>
    );

    return (
        <SettingsForm>
            {downloadedModels.length > 0 ? (
                <FieldGroup.Section title="Downloaded">
                    {downloadedModels.map(renderModelRow)}
                    {availableModels.length === 0 ? (
                        <FieldGroup.SectionFooter>{sectionFooter}</FieldGroup.SectionFooter>
                    ) : null}
                </FieldGroup.Section>
            ) : null}

            {availableModels.length > 0 ? (
                <FieldGroup.Section title="Available">
                    {availableModels.map(renderModelRow)}
                    <FieldGroup.SectionFooter>{sectionFooter}</FieldGroup.SectionFooter>
                </FieldGroup.Section>
            ) : null}
        </SettingsForm>
    );
}
