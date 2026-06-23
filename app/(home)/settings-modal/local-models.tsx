import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import DownloadIcon from "@/assets/icons/download.svg";
import SquareIcon from "@/assets/icons/square.svg";
import TrashIcon from "@/assets/icons/trash.svg";
import {
    deleteLocalModel,
    formatBytes,
    getLocalModelStatus,
    isLocalModelAbortError,
    LOCAL_TRANSLATION_MODELS,
    type LocalTranslationModel,
    type LocalTranslationModelId,
    type LocalModelStatus,
} from "@/clients/local-model";
import { releaseLocalTranslationModel } from "@/clients/local-translation";
import useLocalModelStore from "@/stores/localModelStore";

const colors = {
    screenBackground: "#E1ECDD",
    cardBackground: "#C5D8C0",
    primaryText: "#1E3526",
    mutedText: "#647C61",
    border: "#AFC7A8",
    destructiveText: "#8B332A",
};

type ModelStatusById = Partial<Record<LocalTranslationModelId, LocalModelStatus>>;

export default function LocalModelScreen() {
    const [statusByModelId, setStatusByModelId] = useState<ModelStatusById>({});
    const [isRefreshing, setIsRefreshing] = useState(true);
    const [deletingModelId, setDeletingModelId] = useState<LocalTranslationModelId | null>(null);
    const mountedRef = useRef(true);
    const cancelDownload = useLocalModelStore((state) => state.cancelDownload);
    const downloadProgressByModelId = useLocalModelStore((state) => state.downloadProgressByModelId);
    const downloadingModelId = useLocalModelStore((state) => state.downloadingModelId);
    const setDownloadedModelIds = useLocalModelStore((state) => state.setDownloadedModelIds);
    const selectedModelId = useLocalModelStore((state) => state.selectedModelId);
    const loadedModelId = useLocalModelStore((state) => state.loadedModelId);
    const startDownload = useLocalModelStore((state) => state.startDownload);

    const refreshStatus = useCallback(async () => {
        try {
            const nextStatuses = await Promise.all(
                LOCAL_TRANSLATION_MODELS.map(async (model) => [model.id, await getLocalModelStatus(model.id)] as const)
            );
            const nextStatusByModelId = Object.fromEntries(nextStatuses) as ModelStatusById;

            if (mountedRef.current) {
                setStatusByModelId(nextStatusByModelId);
            }

            await setDownloadedModelIds(
                LOCAL_TRANSLATION_MODELS
                    .filter((model) => nextStatusByModelId[model.id]?.isDownloaded)
                    .map((model) => model.id)
            );
        } catch {
            if (mountedRef.current) {
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
    const downloadedModels = LOCAL_TRANSLATION_MODELS.filter((model) => statusByModelId[model.id]?.isDownloaded);
    const availableModels = LOCAL_TRANSLATION_MODELS.filter((model) => !statusByModelId[model.id]?.isDownloaded);

    const handleDownload = useCallback(async (model: LocalTranslationModel) => {
        if (downloadingModelId || deletingModelId) {
            return;
        }

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
                Alert.alert(
                    "Local model ready",
                    "Translations will use Gemma locally on this device. Respell still uses S A P O online."
                );
            }
        } catch (error) {
            if (mountedRef.current && !isLocalModelAbortError(error)) {
                if (__DEV__) {
                    console.warn("Local model download failed", error);
                }

                Alert.alert(
                    "Download failed",
                    "Unable to download the local model. Please try again."
                );
            }

            await refreshStatus();
        }
    }, [deletingModelId, downloadingModelId, refreshStatus, startDownload]);

    const handleCancelDownload = useCallback(async () => {
        await cancelDownload();
        await refreshStatus();
    }, [cancelDownload, refreshStatus]);

    const handleDeleteModel = useCallback((model: LocalTranslationModel) => {
        if (deletingModelId || downloadingModelId || !statusByModelId[model.id]?.isDownloaded) {
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
                            setDeletingModelId(model.id);
                            if (model.id === loadedModelId) {
                                await releaseLocalTranslationModel();
                                useLocalModelStore.getState().setLoaded(false);
                            }
                            await deleteLocalModel(model.id);
                            await refreshStatus();
                        } catch {
                            Alert.alert("Unable to delete model", "Please try again.");
                        } finally {
                            if (mountedRef.current) {
                                setDeletingModelId(null);
                            }
                        }
                    },
                },
            ]
        );
    }, [deletingModelId, downloadingModelId, loadedModelId, refreshStatus, statusByModelId]);

    const renderModelCard = (model: LocalTranslationModel) => {
        const status = statusByModelId[model.id];
        const isDownloading = downloadingModelId === model.id;
        const isDeleting = deletingModelId === model.id;
        const isBusy = !!downloadingModelId || !!deletingModelId;
        const isModelActionDisabled = isRefreshing || !status?.supported || (isBusy && !isDownloading);
        const modelProgress = downloadProgressByModelId[model.id];
        const modelSizeText = isDownloading
            ? modelProgress?.phase === "finalizing"
                ? "Finalizing..."
                : `${formatBytes(modelProgress?.downloadedBytes ?? status?.downloadedBytes ?? 0)} of ${formatBytes(modelProgress?.expectedBytes ?? status?.expectedBytes ?? model.sizeBytes)}`
            : formatBytes(model.sizeBytes);

        return (
            <View key={model.id} style={styles.modelCard}>
                <View style={styles.modelTextContainer}>
                    <Text style={styles.modelName}>{model.displayName}</Text>
                    <Text style={styles.modelSize}>{modelSizeText}</Text>
                </View>
                <TouchableOpacity
                    accessibilityLabel={isDownloading ? "Cancel download" : status?.isDownloaded ? "Delete local model" : "Download local model"}
                    activeOpacity={0.8}
                    disabled={isModelActionDisabled}
                    onPress={() => {
                        if (isDownloading) {
                            void handleCancelDownload();
                            return;
                        }

                        if (status?.isDownloaded) {
                            handleDeleteModel(model);
                            return;
                        }

                        void handleDownload(model);
                    }}
                    style={[
                        styles.iconButton,
                        status?.isDownloaded && styles.deleteIconButton,
                        isModelActionDisabled && styles.disabledButton,
                    ]}
                >
                    {isDownloading ? (
                        <SquareIcon width={18} height={18} stroke="black" fill="black" />
                    ) : isDeleting ? (
                        <ActivityIndicator color={colors.primaryText} size="small" />
                    ) : status?.isDownloaded ? (
                        <TrashIcon width={20} height={20} stroke={colors.destructiveText} />
                    ) : (
                        <DownloadIcon width={20} height={20} stroke={colors.primaryText} />
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {downloadedModels.length > 0 ? (
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionLabel}>Downloaded</Text>
                    <View style={styles.modelList}>{downloadedModels.map(renderModelCard)}</View>
                </View>
            ) : null}

            {availableModels.length > 0 ? (
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionLabel}>Models</Text>
                    <View style={styles.modelList}>{availableModels.map(renderModelCard)}</View>
                </View>
            ) : null}

            {availableBytes !== null && availableBytes !== undefined ? (
                <Text style={styles.storageText}>
                {formatBytes(availableBytes)} available on this device
                </Text>
            ) : null}

            {!localModelsSupported ? (
                <Text style={styles.noteText}>Local models are available in the iOS and Android apps.</Text>
            ) : (
                <Text style={styles.noteText}>
                    Local translations run without network requests. Other SAPO features continue to use the online service.
                </Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.screenBackground,
    },
    contentContainer: {
        paddingTop: 24,
        paddingHorizontal: 16,
        paddingBottom: 32,
        gap: 12,
    },
    sectionContainer: {
        gap: 6,
    },
    sectionLabel: {
        color: colors.mutedText,
        fontSize: 14,
        fontWeight: "600",
        paddingHorizontal: 4,
    },
    modelList: {
        gap: 8,
    },
    modelCard: {
        backgroundColor: colors.cardBackground,
        borderRadius: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 68,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    modelTextContainer: {
        flex: 1,
        gap: 3,
        paddingRight: 12,
    },
    modelName: {
        color: colors.primaryText,
        fontSize: 16,
        fontWeight: "600",
    },
    modelSize: {
        color: colors.mutedText,
        fontSize: 13,
        fontWeight: "500",
    },
    iconButton: {
        alignItems: "center",
        backgroundColor: "transparent",
        borderRadius: 18,
        height: 36,
        justifyContent: "center",
        width: 36,
    },
    deleteIconButton: {
        backgroundColor: "transparent",
    },
    storageText: {
        color: colors.mutedText,
        fontSize: 13,
        fontWeight: "600",
    },
    disabledButton: {
        opacity: 0.5,
    },
    noteText: {
        color: colors.mutedText,
        fontSize: 13,
        lineHeight: 18,
        paddingHorizontal: 4,
    },
});
