import { createEffect, createSignal, createUniqueId, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";
import Icon from "@/components/ui/Icon";
import TranslationPreview from "./TranslationPreview";

export default function TranslationOutput(props: {
    split: boolean;
    combined: boolean;
    onCopy: (text: string) => void;
}) {
    const { translation } = useAppState();
    const [mouthOpen, setMouthOpen] = createSignal(false);
    const [translationCollapsed, setTranslationCollapsed] = createSignal(false);
    const previewId = createUniqueId();
    const canCopyRespelling = () =>
        translation.state.status === "completed" && translation.state.displayText.trim().length > 0;
    let preview: HTMLDivElement | undefined;
    let output!: HTMLDivElement;
    let previewStickToBottom = true;
    let stickToBottom = true;
    createEffect(
        () => translation.state.mouthTriggerVersion,
        (version) => {
            if (!version) return;
            setMouthOpen(true);
            const timer = setTimeout(() => setMouthOpen(false), 110);
            return () => clearTimeout(timer);
        },
    );
    createEffect(
        () => ({
            preview: translation.state.translationPreview,
            output: translation.state.displayText,
        }),
        () => {
            if (preview && previewStickToBottom) preview.scrollTop = preview.scrollHeight;
            if (output && stickToBottom) output.scrollTop = output.scrollHeight;
        },
    );
    const RespellingCopyButton = () => (
        <Show when={canCopyRespelling()}>
            <button
                class="icon-button respelling-copy-button"
                aria-label="Copy respelling"
                title="Copy respelling"
                onClick={() => props.onCopy(translation.state.displayText)}
            >
                <Icon name="copy" size={20} />
            </button>
        </Show>
    );
    const OutputText = () => (
        <Show
            when={translation.state.displayText}
            fallback={
                <p
                    class={`output-placeholder ${translation.state.status === "loading" ? "breathing" : ""}`}
                >
                    {translation.state.status === "loading"
                        ? "Loading…"
                        : translation.state.operation === "respell"
                          ? "Respelling"
                          : "Translation"}
                </p>
            }
        >
            <p class="translation-text" dir="auto">
                {translation.state.displayText}
                <Show when={translation.state.status === "streaming"}>
                    <span class="stream-cursor" aria-hidden="true" />
                </Show>
            </p>
        </Show>
    );
    const Frog = () => (
        <div class={`frog ${mouthOpen() ? "frog-speaking" : ""}`} aria-hidden="true">
            <img class="frog-closed" src="/app/images/sapo.png" alt="" width="600" height="516" />
            <img
                class="frog-open"
                src="/app/images/sapo-mouth-open.png"
                alt=""
                width="600"
                height="590"
            />
        </div>
    );
    const followOutput = (element: HTMLDivElement) => {
        output = element;
        stickToBottom = true;
    };
    const scrollOutput = () => {
        stickToBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 64;
    };
    const OriginalOutput = () => (
        <div
            class="output-content"
            ref={followOutput}
            onScroll={scrollOutput}
            tabindex={
                translation.state.displayText || translation.state.translationPreview
                    ? 0
                    : undefined
            }
        >
            <Show when={translation.state.translationPreview}>
                <TranslationPreview text={translation.state.translationPreview} />
            </Show>
            <div class={`respelling-output ${props.combined ? "respelling-output-with-copy" : ""}`}>
                <Show when={props.combined}>
                    <RespellingCopyButton />
                </Show>
                <OutputText />
                <Frog />
            </div>
        </div>
    );
    return (
        <Show when={props.split} fallback={<OriginalOutput />}>
            <div
                class={`output-layout-split ${translationCollapsed() ? "translation-collapsed" : ""}`}
            >
                <div class="translation-output-row">
                    <div
                        id={previewId}
                        class="output-content"
                        hidden={translationCollapsed()}
                        role="region"
                        aria-label="Translation"
                        tabindex={0}
                        ref={(element) => {
                            preview = element;
                            previewStickToBottom = true;
                        }}
                        onScroll={(event) => {
                            const element = event.currentTarget;
                            previewStickToBottom =
                                element.scrollHeight - element.scrollTop - element.clientHeight <
                                64;
                        }}
                    >
                        <Show
                            when={translation.state.translationPreview}
                            fallback={
                                <p
                                    class={`output-placeholder ${translation.state.status === "loading" ? "breathing" : ""}`}
                                >
                                    {translation.state.status === "loading"
                                        ? "Loading…"
                                        : "Translation"}
                                </p>
                            }
                        >
                            <p class="translation-text" dir="auto">
                                {translation.state.translationPreview}
                            </p>
                        </Show>
                    </div>
                </div>
                <div class="translation-output-divider">
                    <button
                        class="desktop-translation-collapse-button"
                        aria-expanded={translationCollapsed() ? "false" : "true"}
                        aria-controls={previewId}
                        onClick={() => setTranslationCollapsed(!translationCollapsed())}
                    >
                        {translationCollapsed() ? "Show translation" : "Hide translation"}
                        <Icon name="chevron-down" size={14} />
                    </button>
                </div>
                <div
                    class="output-content"
                    role="region"
                    aria-label="Respelling"
                    tabindex={0}
                    ref={followOutput}
                    onScroll={scrollOutput}
                >
                    <div class="respelling-output respelling-output-with-copy">
                        <RespellingCopyButton />
                        <OutputText />
                    </div>
                    <Frog />
                </div>
            </div>
        </Show>
    );
}
