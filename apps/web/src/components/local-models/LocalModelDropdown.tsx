import { createSignal, createUniqueId, onSettled } from "solid-js";
import Icon from "@/components/ui/Icon";
import { useAppState } from "@/providers/AppProvider";
import LocalModelControls from "./LocalModelControls";

export default function LocalModelDropdown() {
    const { translation } = useAppState();
    const id = createUniqueId();
    const [open, setOpen] = createSignal(false);
    let trigger!: HTMLButtonElement;
    let panel!: HTMLDialogElement;

    onSettled(() => {
        const content = trigger.closest<HTMLElement>(".desktop-toolbar");
        const position = () => {
            const anchor = trigger.getBoundingClientRect();
            const bounds = content?.getBoundingClientRect();
            const right = Math.min(window.innerWidth - 16, bounds?.right ?? window.innerWidth - 16);
            const width = Math.max(0, Math.min(320, right - 16));
            const top = anchor.bottom + 8;
            panel.style.left = `${Math.max(16, Math.min(anchor.left, right - width))}px`;
            panel.style.top = `${top}px`;
            panel.style.width = `${width}px`;
            panel.style.maxHeight = `${Math.max(0, window.innerHeight - top - 16)}px`;
        };
        const beforeToggle = (event: ToggleEvent) => {
            if (event.newState === "open") position();
        };
        const toggle = (event: ToggleEvent) => setOpen(event.newState === "open");
        const reposition = () => {
            if (panel.matches(":popover-open")) {
                position();
            }
        };
        panel.addEventListener("beforetoggle", beforeToggle);
        panel.addEventListener("toggle", toggle);
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
        const observer = new ResizeObserver(reposition);
        observer.observe(trigger);
        if (content) observer.observe(content);
        return () => {
            panel.removeEventListener("beforetoggle", beforeToggle);
            panel.removeEventListener("toggle", toggle);
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
            observer.disconnect();
        };
    });

    return (
        <div class="model-dropdown">
            <button
                ref={(element) => {
                    trigger = element;
                }}
                type="button"
                class="model-dropdown-trigger"
                popovertarget={id}
                aria-label="Translation models"
                aria-haspopup="dialog"
                aria-controls={id}
                aria-expanded={open() ? "true" : "false"}
            >
                <span>{translation.usesLocalModel() ? "Local" : "Online"}</span>
                <Icon name="chevron-down" size={16} />
            </button>
            <dialog
                ref={(element) => {
                    panel = element;
                }}
                id={id}
                class="model-dropdown-panel"
                popover="auto"
                aria-label="Translation models"
                aria-modal="false"
            >
                <LocalModelControls
                    animateControls
                    managementLabel="Manage Local AI"
                    onNavigate={() => panel.hidePopover()}
                />
            </dialog>
        </div>
    );
}
