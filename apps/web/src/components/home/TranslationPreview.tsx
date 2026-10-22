import { createSignal, createUniqueId, onSettled, Show } from "solid-js";
import Icon from "@/components/ui/Icon";

export default function TranslationPreview(props: { text: string }) {
    const [expanded, setExpanded] = createSignal(true);
    const [canCollapse, setCanCollapse] = createSignal(false);
    const textId = createUniqueId();
    const collapsed = () => canCollapse() && !expanded();
    let measurement!: HTMLParagraphElement;

    onSettled(() => {
        const measure = () => {
            const lineHeight = parseFloat(getComputedStyle(measurement).lineHeight);
            setCanCollapse(measurement.getBoundingClientRect().height > lineHeight * 2 + 1);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(measurement);
        measure();
        return () => observer.disconnect();
    });

    return (
        <div class={`translation-preview ${collapsed() ? "is-collapsed" : ""}`}>
            <div class="translation-preview-body" role="region" aria-label="Translation">
                <p
                    class="translation-preview-text translation-preview-measure"
                    aria-hidden="true"
                    dir="auto"
                    ref={(element) => {
                        measurement = element;
                    }}
                >
                    {props.text}
                </p>
                <p id={textId} class="translation-preview-text" dir="auto">
                    {props.text}
                </p>
            </div>
            <Show when={canCollapse()}>
                <div class="translation-preview-control">
                    <button
                        class="translation-collapse-button"
                        aria-expanded={expanded() ? "true" : "false"}
                        aria-controls={textId}
                        onClick={() => setExpanded(!expanded())}
                    >
                        {expanded() ? "Show less" : "Show translation"}
                        <Icon name="chevron-down" size={14} />
                    </button>
                </div>
            </Show>
        </div>
    );
}
