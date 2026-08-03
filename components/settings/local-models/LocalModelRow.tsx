import { Column, RNHostView, Row, Spacer, Text } from "@expo/ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { ActivityIndicator, Platform, Pressable, StyleSheet } from "react-native";

import DownloadIcon from "@/assets/icons/download.svg";
import SquareIcon from "@/assets/icons/square.svg";
import TrashIcon from "@/assets/icons/trash.svg";
import {
    SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
    SETTINGS_COLORS,
    SETTINGS_DISABLED_OPACITY,
    SETTINGS_ROW_CONTENT_SPACING,
} from "@/constants/settings";
import type {
    LocalModelDownloadProgress,
    LocalModelStatus,
    LocalTranslationModel,
} from "@/types/localModels";
import { formatBytes } from "@/utils/formatBytes";

interface LocalModelRowProps {
    model: LocalTranslationModel;
    status?: LocalModelStatus;
    progress?: LocalModelDownloadProgress;
    isDownloaded: boolean;
    isDownloading: boolean;
    isDeleting: boolean;
    disabled: boolean;
    onDownload: () => void;
    onCancelDownload: () => void;
    onDelete: () => void;
}

const isIOS = Platform.OS === "ios";
const bodyFontModifiers = isIOS ? [font({ textStyle: "body", weight: "regular" })] : undefined;
const footnoteFontModifiers = isIOS
    ? [font({ textStyle: "footnote", weight: "regular" })]
    : undefined;

export default function LocalModelRow({
    model,
    status,
    progress,
    isDownloaded,
    isDownloading,
    isDeleting,
    disabled,
    onDownload,
    onCancelDownload,
    onDelete,
}: LocalModelRowProps) {
    const modelSizeText = isDownloading
        ? progress?.phase === "finalizing"
            ? "Finalizing..."
            : `${formatBytes(progress?.downloadedBytes ?? status?.downloadedBytes ?? 0)} of ${formatBytes(progress?.expectedBytes ?? status?.expectedBytes ?? model.sizeBytes)}`
        : formatBytes(model.sizeBytes);

    const handlePress = () => {
        if (isDownloading) {
            onCancelDownload();
            return;
        }

        if (isDownloaded) {
            onDelete();
            return;
        }

        onDownload();
    };

    return (
        <Row
            alignment="center"
            spacing={SETTINGS_ROW_CONTENT_SPACING}
            style={{ width: "100%" }}
        >
            <Column spacing={2}>
                <Text
                    modifiers={bodyFontModifiers}
                    textStyle={{
                        color: SETTINGS_COLORS.primaryText,
                        fontSize: isIOS ? undefined : 16,
                        fontWeight: isIOS ? undefined : "500",
                    }}
                >
                    {model.displayName}
                </Text>
                <Text
                    modifiers={footnoteFontModifiers}
                    textStyle={{
                        color: SETTINGS_COLORS.mutedText,
                        fontSize: isIOS ? undefined : SETTINGS_ANDROID_FOOTNOTE_FONT_SIZE,
                    }}
                >
                    {modelSizeText}
                </Text>
            </Column>
            <Spacer flexible />
            <RNHostView matchContents>
                <Pressable
                    accessibilityLabel={
                        isDownloading
                            ? "Cancel download"
                            : isDownloaded
                              ? "Delete local model"
                              : "Download local model"
                    }
                    accessibilityRole="button"
                    disabled={disabled}
                    hitSlop={6}
                    onPress={handlePress}
                    style={({ pressed }) => [
                        styles.iconButton,
                        disabled && styles.disabledButton,
                        pressed && styles.pressedButton,
                    ]}
                >
                    {isDownloading ? (
                        <SquareIcon
                            width={18}
                            height={18}
                            stroke={SETTINGS_COLORS.primaryText}
                            fill={SETTINGS_COLORS.primaryText}
                        />
                    ) : isDeleting ? (
                        <ActivityIndicator color={SETTINGS_COLORS.primaryText} size="small" />
                    ) : isDownloaded ? (
                        <TrashIcon
                            width={20}
                            height={20}
                            stroke={SETTINGS_COLORS.destructiveText}
                        />
                    ) : (
                        <DownloadIcon
                            width={20}
                            height={20}
                            stroke={SETTINGS_COLORS.primaryText}
                        />
                    )}
                </Pressable>
            </RNHostView>
        </Row>
    );
}

const styles = StyleSheet.create({
    iconButton: {
        alignItems: "center",
        height: 36,
        justifyContent: "center",
        width: 36,
    },
    disabledButton: {
        opacity: SETTINGS_DISABLED_OPACITY,
    },
    pressedButton: {
        opacity: 0.6,
    },
});
