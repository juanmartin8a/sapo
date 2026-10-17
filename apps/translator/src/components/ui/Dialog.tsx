import { onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";

export default function Dialog(props: {
    title: string;
    onClose: () => void;
    children: JSX.Element;
    class?: string;
}) {
    let dialog!: HTMLDialogElement;
    onSettled(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        dialog.showModal();
        return () => {
            dialog.close();
            previousFocus?.focus();
        };
    });
    return (
        <dialog
            ref={dialog}
            class={`dialog ${props.class ?? ""}`}
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
