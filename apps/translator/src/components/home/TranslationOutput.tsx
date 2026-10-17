import { createEffect, createSignal, onSettled, Show } from "solid-js";
import { useAppState } from "@/providers/AppProvider";

export default function TranslationOutput() {
    const { translation } = useAppState();
    const [mouthOpen, setMouthOpen] = createSignal(false);
    let output!: HTMLDivElement;
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
        () =>
            `${translation.state.translationPreview}${translation.state.displayText}`,
        () => {
            if (output && stickToBottom) output.scrollTop = output.scrollHeight;
        },
    );
    onSettled(() => {
        stickToBottom = true;
    });
    return (
        <div
            class="output-content"
            ref={output}
            onScroll={() => {
                stickToBottom =
                    output.scrollHeight -
                        output.scrollTop -
                        output.clientHeight <
                    64;
            }}
        >
            <Show when={translation.state.translationPreview}>
                <div class="translation-preview">
                    <span class="eyebrow">Translation</span>
                    <p dir="auto">{translation.state.translationPreview}</p>
                    <span class="eyebrow">Respelling</span>
                </div>
            </Show>
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
            <div
                class={`frog ${mouthOpen() ? "frog-speaking" : ""}`}
                aria-hidden="true"
            >
                <img
                    class="frog-closed"
                    src="/app/images/sapo.png"
                    alt=""
                    width="600"
                    height="516"
                />
                <img
                    class="frog-open"
                    src="/app/images/sapo-mouth-open.png"
                    alt=""
                    width="600"
                    height="590"
                />
            </div>
        </div>
    );
}
