import { createEffect, createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { useAppState } from "@/providers/AppProvider";

export default function HomePager(props: { children: JSX.Element }) {
    const { translation, isPwa } = useAppState();
    const [width, setWidth] = createSignal(0);
    let pager!: HTMLDivElement;
    let updatedByScroll = false;
    let programmaticTarget: number | null = null;

    onSettled(() => {
        if (!isPwa) return;
        const observer = new ResizeObserver(() => setWidth(pager.clientWidth));
        observer.observe(pager);
        setWidth(pager.clientWidth);
        return () => observer.disconnect();
    });

    createEffect(
        () => ({
            pane: translation.state.mobilePane,
            singleScreen: translation.state.singleScreen,
            width: width(),
        }),
        (current, previous) => {
            if (!isPwa || !current.width) return;
            if (updatedByScroll) {
                updatedByScroll = false;
                return;
            }
            const paged = !current.singleScreen;
            const left = paged && current.pane === "output" ? current.width : 0;
            const animate =
                previous?.width === current.width &&
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            programmaticTarget = left;
            pager.scrollTo({ left, behavior: animate ? "smooth" : "instant" });
        },
    );

    function handleScroll() {
        if (!isPwa || translation.state.singleScreen) return;
        if (programmaticTarget !== null) {
            if (Math.abs(pager.scrollLeft - programmaticTarget) < 1) programmaticTarget = null;
            return;
        }
        const pane = pager.scrollLeft >= pager.clientWidth / 2 ? "output" : "input";
        if (pane !== translation.state.mobilePane) {
            updatedByScroll = true;
            translation.setMobilePane(pane);
        }
    }

    return (
        <div
            class="translation-workspace"
            ref={(element) => {
                pager = element;
            }}
            onScroll={handleScroll}
            onTouchStart={() => {
                programmaticTarget = null;
            }}
        >
            {props.children}
        </div>
    );
}
