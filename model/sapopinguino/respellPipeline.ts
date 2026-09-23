import { TranslationPreviewParser } from "./translationPreviewParser";
import { isRespellLanguage } from "./languages";
import { streamCloudflareAI } from "./cloudflareAi";
import { readRespellPipelineLanguages } from "./input";

const MAX_TRANSLATED_TEXT_CHARS = 65_536;

type RespellPipelineArguments = Omit<Parameters<typeof streamCloudflareAI>[0], "operation"> & {
    translateThenRespell: boolean;
    respellLanguage?: string;
    onTranslation?: (text: string) => Promise<void>;
    onRespellStart?: () => void;
    onSourceUndetermined?: () => void;
};

export async function streamRespellPipeline(args: RespellPipelineArguments) {
    let respellInput = args.input;
    if (args.translateThenRespell) {
        const languages = readRespellPipelineLanguages(args.input);
        if (!languages) {
            await args.onErrored();
            return "errored" as const;
        }

        const selectedRespellLanguage = args.respellLanguage ?? "Source";
        let respellLanguage = selectedRespellLanguage === "Source" ? languages.inputLanguage : selectedRespellLanguage;
        const detectSourceLanguage = respellLanguage === "Auto-detect";
        const parser = detectSourceLanguage ? new TranslationPreviewParser() : null;
        let rawTranslation = "";
        let translation = "";
        const result = await streamCloudflareAI({
            input: args.input,
            operation: "translate",
            pipelineTranslation: true,
            detectSourceLanguage,
            signal: args.signal,
            onDelta: async (delta) => {
                if (parser) {
                    if (rawTranslation.length + delta.length > MAX_TRANSLATED_TEXT_CHARS * 6 + 1024) {
                        await args.onErrored();
                        return "errored";
                    }
                    rawTranslation += delta;
                }
                let text: string;
                try {
                    text = parser ? parser.consume(delta) : delta;
                } catch {
                    await args.onErrored();
                    return "errored";
                }
                translation += text;
                if (translation.length > MAX_TRANSLATED_TEXT_CHARS) {
                    await args.onErrored();
                    return "errored";
                }
                if (text) await args.onTranslation?.(text);
                return "continue";
            },
            onCompleted: () => {},
            onErrored: args.onErrored,
        });
        if (result !== "completed") {
            return result;
        }
        args.signal.throwIfAborted();
        if (detectSourceLanguage) {
            try {
                const parsed = JSON.parse(rawTranslation);
                if (!parsed || Object.keys(parsed).length !== 2 || typeof parsed.translation !== "string" ||
                    parsed.translation !== translation || typeof parsed.detectedSourceLanguage !== "string") {
                    throw new Error("Invalid translation response");
                }
                if (!isRespellLanguage(parsed.detectedSourceLanguage)) {
                    args.onSourceUndetermined?.();
                    await args.onErrored();
                    return "errored" as const;
                }
                respellLanguage = parsed.detectedSourceLanguage;
            } catch {
                await args.onErrored();
                return "errored" as const;
            }
        }
        if (!translation.trim() || !isRespellLanguage(respellLanguage)) {
            await args.onErrored();
            return "errored" as const;
        }

        respellInput = JSON.stringify({
            input_language: languages.targetLanguage,
            target_language: respellLanguage,
            input: translation,
        });
    }

    if (args.translateThenRespell) args.onRespellStart?.();
    return streamCloudflareAI({
        input: respellInput,
        operation: "respell",
        signal: args.signal,
        onDelta: args.onDelta,
        onCompleted: args.onCompleted,
        onErrored: args.onErrored,
    });
}
