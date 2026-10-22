import { createEffect, createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { useAppState } from "@/providers/AppProvider";

export default function HomePager(props: { children: JSX.Element }) {
    const { translation, isPwa } = useAppState();
    const [width, setWidth] = createSignal(0);
    const [dragging, setDragging] = createSignal(false);
    const [paging, setPaging] = createSignal(false);
    let pager!: HTMLDivElement;
    let updatedByScroll = false;
    let programmaticTarget: number | null = null;
    let pendingScrollFrame: number | undefined;
    let gesture: {
        pointerId: number;
        x: number;
        y: number;
        left: number;
    } | null = null;

    onSettled(() => {
        if (!isPwa) return;
        const observer = new ResizeObserver(() => setWidth(pager.clientWidth));
        observer.observe(pager);
        setWidth(pager.clientWidth);
        return () => {
            observer.disconnect();
            if (pendingScrollFrame !== undefined) cancelAnimationFrame(pendingScrollFrame);
        };
    });

    function finishPaging() {
        if (pendingScrollFrame !== undefined) cancelAnimationFrame(pendingScrollFrame);
        pendingScrollFrame = undefined;
        programmaticTarget = null;
        setPaging(false);
        pager.style.removeProperty("--pager-height");
    }

    function scrollToPane(left: number, animate: boolean) {
        finishPaging();
        programmaticTarget = left;
        if (!animate || Math.abs(pager.scrollLeft - left) < 1) {
            pager.scrollTo({ left, behavior: "instant" });
            programmaticTarget = null;
            return;
        }
        // Keep both panes laid out and disable snap while the scroll animates.
        // Wait for pane visibility and textarea resizing to settle before starting.
        pager.style.setProperty("--pager-height", `${pager.clientHeight}px`);
        setPaging(true);
        pendingScrollFrame = requestAnimationFrame(() => {
            pendingScrollFrame = undefined;
            pager.scrollTo({ left, behavior: "smooth" });
        });
    }

    createEffect(
        () => ({
            pane: translation.state.mobilePane,
            singleScreen: translation.state.singleScreen,
            width: width(),
        }),
        (current, previous) => {
            if (!isPwa || !current.width) return;
            if (
                previous &&
                previous.pane !== current.pane &&
                !current.singleScreen &&
                window.matchMedia("(max-width: 899px)").matches &&
                window.scrollY > 0
            ) {
                window.scrollTo({ top: 0, behavior: "instant" });
            }
            if (updatedByScroll) {
                updatedByScroll = false;
                return;
            }
            const paged = !current.singleScreen;
            const left = paged && current.pane === "output" ? current.width : 0;
            const animate =
                previous?.width === current.width &&
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            scrollToPane(left, paged && animate);
        },
    );

    function handleScroll() {
        if (!isPwa || translation.state.singleScreen || dragging()) return;
        if (programmaticTarget !== null) {
            if (
                pendingScrollFrame === undefined &&
                Math.abs(pager.scrollLeft - programmaticTarget) < 1
            )
                finishPaging();
            return;
        }
        const pane = pager.scrollLeft >= pager.clientWidth / 2 ? "output" : "input";
        if (pane !== translation.state.mobilePane) {
            updatedByScroll = true;
            translation.setMobilePane(pane);
        }
    }

    function startSwipe(event: PointerEvent) {
        if (!isPwa || translation.state.singleScreen || !event.isPrimary || event.button !== 0)
            return;
        finishPaging();
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, select, [contenteditable]")) return;
        // Keep mouse text selection and existing touch selections available.
        if (
            (event.pointerType === "mouse" &&
                target.closest("textarea, .translation-text, .translation-preview")) ||
            (target instanceof HTMLTextAreaElement &&
                target.selectionStart !== target.selectionEnd) ||
            window.getSelection()?.isCollapsed === false
        )
            return;
        gesture = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: pager.scrollLeft,
        };
    }

    function moveSwipe(event: PointerEvent) {
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const dx = gesture.x - event.clientX;
        const dy = gesture.y - event.clientY;
        if (!dragging()) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
                gesture = null;
                return;
            }
            if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
            pager.style.setProperty("--pager-height", `${pager.clientHeight}px`);
            setDragging(true);
            pager.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        pager.scrollTo({ left: gesture.left + dx, behavior: "instant" });
    }

    function endSwipe(event: PointerEvent) {
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const dx = gesture.x - event.clientX;
        gesture = null;
        const swiped = dragging();
        setDragging(false);
        pager.style.removeProperty("--pager-height");
        if (pager.hasPointerCapture(event.pointerId)) pager.releasePointerCapture(event.pointerId);
        if (!swiped) return;
        const pane =
            event.type === "pointerup" && Math.abs(dx) >= Math.min(pager.clientWidth * 0.2, 72)
                ? dx > 0
                    ? "output"
                    : "input"
                : translation.state.mobilePane;
        if (pane !== translation.state.mobilePane) translation.setMobilePane(pane);
        else {
            scrollToPane(
                pane === "output" ? pager.clientWidth : 0,
                !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            );
        }
    }

    return (
        <div
            class={`translation-workspace ${dragging() ? "is-dragging" : ""} ${paging() ? "is-paging" : ""}`}
            ref={(element) => {
                pager = element;
            }}
            onScroll={handleScroll}
            onPointerDown={startSwipe}
            onPointerMove={moveSwipe}
            onPointerUp={endSwipe}
            onPointerCancel={endSwipe}
            onLostPointerCapture={endSwipe}
            onPointerLeave={() => {
                if (!dragging()) gesture = null;
            }}
            onWheel={() => {
                finishPaging();
            }}
        >
            {props.children}
        </div>
    );
}
