import { createSignal, onSettled } from "solid-js";
import { useRouter } from "@tanstack/solid-router";
import { waitForFrogImages } from "./frogTransition";

export function createFrogAnimation(durations: () => readonly number[]) {
    const transitions = useRouter().options.context!.frogTransitions;
    const [revealed, setRevealed] = createSignal(Infinity);
    const [speaking, setSpeaking] = createSignal(false);
    let reducedMotion = false;
    let introCancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    function stop() {
        introCancelled = true;
        timers.forEach(clearTimeout);
        timers.length = 0;
        clearTimeout(clickTimer);
        setSpeaking(false);
        setRevealed(Infinity);
    }
    function openMouth() {
        if (speaking() || reducedMotion || revealed() < durations().length - 1) return;
        stop();
        setSpeaking(true);
        clickTimer = setTimeout(() => setSpeaking(false), 200);
    }
    async function playIntro() {
        if (!(await waitForFrogImages())) return;
        await transitions.wait();
        if (introCancelled) return;

        // Keep the heading visible until the frog speaks the first word.
        let elapsed = 80;
        durations().forEach((duration, index) => {
            timers.push(
                setTimeout(() => {
                    setRevealed(index);
                    setSpeaking(true);
                }, elapsed),
            );
            timers.push(setTimeout(() => setSpeaking(false), elapsed + duration - 65));
            elapsed += duration;
        });
    }
    onSettled(() => {
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotion = () => {
            reducedMotion = motion.matches;
            if (reducedMotion) stop();
        };
        updateMotion();
        if (!reducedMotion) void playIntro();
        motion.addEventListener("change", updateMotion);
        return () => {
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
