import { onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import Icon from "./Icon";

export default function Dialog(props: {
    title: string;
    hideHeader?: boolean;
    onClose: () => void;
    children: JSX.Element;
    class?: string;
    anchor?: HTMLElement;
}) {
    let dialog!: HTMLDialogElement;
    onSettled(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const anchor = props.anchor;
        const media = anchor ? window.matchMedia("(min-width: 900px)") : undefined;
        let popup = false;
        let presenting = false;
        let focusMovedOutside = false;

        const position = () => {
            if (!popup || !anchor) return;
            const bounds = anchor.getBoundingClientRect();
            const width = Math.min(360, window.innerWidth - 32);
            const top = bounds.bottom + 8;
            dialog.style.left = `${Math.max(16, Math.min(bounds.left, window.innerWidth - width - 16))}px`;
            dialog.style.top = `${top}px`;
            dialog.style.width = `${width}px`;
            dialog.style.maxHeight = `${Math.max(0, window.innerHeight - top - 16)}px`;
        };
        const present = () => {
            presenting = true;
            if (popup) dialog.hidePopover();
            else if (dialog.open) dialog.close();
            popup = media?.matches ?? false;
            dialog.classList.toggle("dialog-popover", popup);
            dialog.setAttribute("aria-modal", String(!popup));
            if (popup) {
                dialog.setAttribute("popover", "auto");
                position();
                dialog.showPopover({ source: anchor });
                dialog.querySelector<HTMLButtonElement>("button")?.focus();
            } else {
                dialog.removeAttribute("popover");
                dialog.removeAttribute("style");
                dialog.showModal();
            }
            presenting = false;
        };
        const toggled = (event: ToggleEvent) => {
            // A queued close from switching presentations can arrive after reopening.
            if (popup && event.newState === "closed" && !dialog.matches(":popover-open")) {
                props.onClose();
            }
        };
        const focusOut = (event: FocusEvent) => {
            if (
                popup &&
                !presenting &&
                event.relatedTarget instanceof Node &&
                !anchor?.contains(event.relatedTarget) &&
                !dialog.contains(event.relatedTarget)
            ) {
                focusMovedOutside = true;
                props.onClose();
            }
        };
        present();
        let observer: ResizeObserver | undefined;
        if (anchor) {
            dialog.addEventListener("toggle", toggled);
            dialog.addEventListener("focusout", focusOut);
            media?.addEventListener("change", present);
            window.addEventListener("resize", position);
            window.addEventListener("scroll", position, true);
            observer = new ResizeObserver(position);
            observer.observe(anchor);
        }
        return () => {
            const restoreFocus =
                !focusMovedOutside &&
                (dialog.contains(document.activeElement) ||
                    document.activeElement === document.body);
            dialog.removeEventListener("toggle", toggled);
            dialog.removeEventListener("focusout", focusOut);
            media?.removeEventListener("change", present);
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
            observer?.disconnect();
            if (popup) dialog.hidePopover();
            else dialog.close();
            if (restoreFocus) previousFocus?.focus();
        };
    });
    return (
        <dialog
            ref={(element) => {
                dialog = element;
            }}
            class={`dialog ${props.class ?? ""}`}
            role="dialog"
            aria-label={props.title}
            onCancel={(event) => {
                event.preventDefault();
                props.onClose();
            }}
            onClick={(event) => {
                if (event.target === dialog) props.onClose();
            }}
        >
            <div class="dialog-content">
                <Show when={!props.hideHeader}>
                    <header class="dialog-header">
                        <h2>{props.title}</h2>
                        <button
                            type="button"
                            class="icon-button close-button"
                            aria-label="Close"
                            onClick={() => props.onClose()}
                        >
                            <Icon name="x" size={24} />
                        </button>
                    </header>
                </Show>
                {props.children}
            </div>
        </dialog>
    );
}
