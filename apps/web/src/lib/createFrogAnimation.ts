import { createSignal, onSettled } from "solid-js";
import { useRouter } from "@tanstack/solid-router";
import { waitForFrogImages } from "./frogTransition";

export function createFrogAnimation(durations: () => readonly number[]) {
    const transitions = useRouter().options.context!.frogTransitions;
    const [revealed, setRevealed] = createSignal(Infinity);
    const [speaking, setSpeaking] = createSignal(false);
    let reducedMotion = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    function stop() {
        timers.forEach(clearTimeout);
        timers = [];
        setSpeaking(false);
        setRevealed(Infinity);
    }
    function openMouth() {
        if (speaking() || reducedMotion || revealed() < durations().length - 1) return;
        setSpeaking(true);
        timers.push(setTimeout(() => setSpeaking(false), 200));
    }
    onSettled(() => {
        let disposed = false;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotion = () => {
            reducedMotion = motion.matches;
            if (reducedMotion) stop();
        };
        updateMotion();
        if (!reducedMotion) setRevealed(-1);
        void waitForFrogImages()
            .then(transitions.wait)
            .then(() => {
                if (disposed || reducedMotion) return;
                durations().reduce((elapsed, duration, index) => {
                    timers.push(
                        setTimeout(() => {
                            setRevealed(index);
                            setSpeaking(true);
                        }, elapsed),
                    );
                    timers.push(setTimeout(() => setSpeaking(false), elapsed + duration - 65));
                    return elapsed + duration;
                }, 80);
            });
        motion.addEventListener("change", updateMotion);
        return () => {
            disposed = true;
            stop();
            motion.removeEventListener("change", updateMotion);
        };
    });
    return {
        revealed,
        speaking,
        openMouth,
        disabled: () => speaking() || revealed() < durations().length - 1,
    };
}
export type FrogAnimation = ReturnType<typeof createFrogAnimation>;
