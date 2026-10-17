import { createMemo, createSignal, For, Show } from "solid-js";
import Dialog from "./Dialog";
import Icon from "./Icon";

export default function LanguageSelector(props: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = createSignal(false);
    const [search, setSearch] = createSignal("");
    const filtered = createMemo(() =>
        props.options.filter((language) =>
            language.toLowerCase().includes(search().toLowerCase().trim()),
        ),
    );
    return (
        <>
            <button
                class="language-button"
                aria-label={`${props.label}: ${props.value}`}
                aria-haspopup="dialog"
                disabled={props.disabled}
                onClick={() => {
                    setSearch("");
                    setOpen(true);
                }}
            >
                <span>{props.value}</span>
                <span class="chevron-down" aria-hidden="true">
                    ⌄
                </span>
            </button>
            <Show when={open()}>
                <Dialog
                    title={props.label}
                    onClose={() => setOpen(false)}
                    class="language-dialog"
                >
                    <input
                        class="search-input"
                        aria-label="Search languages"
                        placeholder="Search languages…"
                        value={search()}
                        onInput={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                    />
                    <div
                        class="language-list"
                        role="group"
                        aria-label={props.label}
                    >
                        <For each={filtered()}>
                            {(language) => (
                                <button
                                    class="language-option"
                                    aria-pressed={
                                        props.value === language
                                            ? "true"
                                            : "false"
                                    }
                                    onClick={() => {
                                        props.onChange(language);
                                    }}
                                >
                                    <span>{language}</span>
                                    <Show when={props.value === language}>
                                        <Icon name="check" size={18} />
                                    </Show>
                                </button>
                            )}
                        </For>
                        <Show when={filtered().length === 0}>
                            <p class="muted empty-search">
                                No languages found.
                            </p>
                        </Show>
                    </div>
                </Dialog>
            </Show>
        </>
    );
}
