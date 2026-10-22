import { createEffect, onSettled } from "solid-js";
import { useAppState } from "@/providers/AppProvider";

export default function TranslationInput() {
    const { translation, isPwa } = useAppState();
    let input!: HTMLTextAreaElement;
    let resizeInput = () => {};

    createEffect(
        () => translation.state.input,
        () => resizeInput(),
    );

    onSettled(() => {
        if (isPwa) return;
        const stacked = window.matchMedia("(max-width: 899px)");
        let width = input.clientWidth;
        const resize = () => {
            if (!stacked.matches) {
                input.style.removeProperty("height");
                return;
            }
            input.style.height = "auto";
            input.style.height = `${input.scrollHeight}px`;
        };
        resizeInput = resize;
        const observer = new ResizeObserver(() => {
            if (input.clientWidth === width) return;
            width = input.clientWidth;
            resize();
        });
        observer.observe(input);
        stacked.addEventListener("change", resize);
        resize();
        return () => {
            observer.disconnect();
            stacked.removeEventListener("change", resize);
            resizeInput = () => {};
        };
    });

    return (
        <textarea
            id="translation-input"
            class="translation-input"
            placeholder="Enter text…"
            value={translation.state.input}
            dir="auto"
            spellcheck={false}
            ref={(element) => {
                input = element;
            }}
            onInput={(event) => translation.setInput(event.currentTarget.value)}
        />
    );
}
