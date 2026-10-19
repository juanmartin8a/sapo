import { onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";

export default function Dialog(props: {
    title: string;
    onClose: () => void;
    children: JSX.Element;
    class?: string;
    anchor?: HTMLElement;
}) {
    let dialog!: HTMLDialogElement;
    onSettled(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const media = window.matchMedia("(min-width: 900px)");
        let popup = false;
        let disposed = false;
        let presenting = false;
        let focusMovedOutside = false;

        const position = () => {
            if (!popup || !props.anchor) return;
            const anchor = props.anchor.getBoundingClientRect();
            const width = Math.min(360, window.innerWidth - 32);
            const top = anchor.bottom + 8;
            dialog.style.left = `${Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16))}px`;
            dialog.style.top = `${top}px`;
            dialog.style.width = `${width}px`;
            dialog.style.maxHeight = `${Math.max(0, window.innerHeight - top - 16)}px`;
        };
        const present = () => {
            presenting = true;
            if (popup) dialog.hidePopover();
            else if (dialog.open) dialog.close();
            popup = Boolean(props.anchor && media.matches);
            dialog.classList.toggle("dialog-popover", popup);
            dialog.setAttribute("aria-modal", String(!popup));
            if (popup) {
                dialog.setAttribute("popover", "auto");
                position();
                dialog.showPopover({ source: props.anchor });
                (
                    dialog.querySelector<HTMLElement>("input") ??
                    dialog.querySelector<HTMLElement>("button")
                )?.focus();
            } else {
                dialog.removeAttribute("popover");
                dialog.removeAttribute("style");
                dialog.showModal();
            }
            presenting = false;
        };
        const toggled = (event: ToggleEvent) => {
            if (!disposed && popup && event.newState === "closed") props.onClose();
        };
        const focusOut = (event: FocusEvent) => {
            if (
                popup &&
                !presenting &&
                event.relatedTarget instanceof Node &&
                !props.anchor?.contains(event.relatedTarget) &&
                !dialog.contains(event.relatedTarget)
            ) {
                focusMovedOutside = true;
                props.onClose();
            }
        };
        present();
        dialog.addEventListener("toggle", toggled);
        dialog.addEventListener("focusout", focusOut);
        if (props.anchor) media.addEventListener("change", present);
        window.addEventListener("resize", position);
        window.addEventListener("scroll", position, true);
        const observer = new ResizeObserver(position);
        if (props.anchor) observer.observe(props.anchor);
        return () => {
            disposed = true;
            const restoreFocus =
                !focusMovedOutside &&
                (dialog.contains(document.activeElement) ||
                    document.activeElement === document.body);
            dialog.removeEventListener("toggle", toggled);
            dialog.removeEventListener("focusout", focusOut);
            media.removeEventListener("change", present);
            window.removeEventListener("resize", position);
            window.removeEventListener("scroll", position, true);
            observer.disconnect();
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
                <header class="dialog-header">
                    <h2>{props.title}</h2>
                    <button
                        class="icon-button close-button"
                        aria-label="Close"
                        onClick={() => props.onClose()}
                    >
                        ×
                    </button>
                </header>
                {props.children}
            </div>
        </dialog>
    );
}
