import { Link, useNavigate, useSearch } from "@tanstack/solid-router";
import { For, Match, Show, Switch } from "solid-js";
import { createPronunciationStore } from "@/stores/pronunciationStore";
import PageHeading from "./PageHeading";

const filters = [
    { key: "source", label: "Source language" },
    { key: "target", label: "Target language" },
] as const;

export default function DatabasePage() {
    const search = useSearch({ from: "/_site/multilingual-phonetic-representations/" });
    const navigate = useNavigate();
    const browser = createPronunciationStore(() => ({
        source: search().source ?? "",
        target: search().target ?? "",
    }));
    const state = browser.state;
    const nameFor = (code: string) =>
        state.languages.find((language) => language.language_code === code)?.name ?? code;
    function setFilter(key: "source" | "target", value: string) {
        void navigate({
            to: "/multilingual-phonetic-representations/",
            search: (previous) => ({ ...previous, [key]: value || undefined }),
            replace: true,
            hash: true,
            resetScroll: false,
        });
    }
    function goToPage(index: number) {
        void browser.loadPage(index);
        document.getElementById("results")?.scrollIntoView({ block: "start" });
    }
    return (
        <div class="database-page">
            <section aria-label="Multilingual phonetic representations">
                <PageHeading title="Multilingual phonetic representations">
                    <Link class="resource-link" to="/multilingual-phonetic-representations/about/">
                        About this database <span aria-hidden="true">→</span>
                    </Link>
                </PageHeading>
            </section>
            <section aria-label="Filters" class="filters">
                <For each={filters}>
                    {(filter) => (
                        <label>
                            <span>{filter.label}</span>
                            <select
                                onChange={(event) =>
                                    setFilter(filter.key, event.currentTarget.value)
                                }
                            >
                                <option value="" selected={!state.mounted || !search()[filter.key]}>
                                    Choose a language
                                </option>
                                <For each={state.languages}>
                                    {(language) => (
                                        <option
                                            value={language.language_code}
                                            selected={
                                                state.mounted &&
                                                search()[filter.key] === language.language_code
                                            }
                                        >
                                            {language.name}
                                        </option>
                                    )}
                                </For>
                            </select>
                        </label>
                    )}
                </For>
                <Show when={state.languagesStatus === "error"}>
                    <div role="alert" class="status-message filter-error">
                        <span>Couldn't load languages. Please try again.</span>
                        <button
                            type="button"
                            class="text-button"
                            onClick={() => void browser.loadLanguages()}
                        >
                            Retry <span aria-hidden="true">↗</span>
                        </button>
                    </div>
                </Show>
            </section>
            <noscript>
                <p class="status-message">Enable JavaScript to browse pronunciations.</p>
            </noscript>
            <section
                id="results"
                aria-live="polite"
                aria-busy={state.resultsStatus === "loading" ? "true" : "false"}
            >
                <Switch>
                    <Match when={state.resultsStatus === "idle"}>
                        <p class="empty-state">
                            Choose a source and a target language to see pronunciations.
                        </p>
                    </Match>
                    <Match when={state.resultsStatus === "error"}>
                        <div role="alert" class="status-message">
                            <span>Couldn't load pronunciations. Please try again.</span>
                            <button
                                type="button"
                                class="text-button"
                                onClick={() => void browser.retry()}
                            >
                                Retry <span aria-hidden="true">↗</span>
                            </button>
                        </div>
                    </Match>
                    <Match when={state.resultsStatus === "loading" && state.rows.length === 0}>
                        <div class="loading-rows" aria-label="Loading pronunciations">
                            <p class="loading-label">Loading pronunciations…</p>
                            <For each={Array.from({ length: 6 })}>
                                {() => <div class="loading-row" />}
                            </For>
                        </div>
                    </Match>
                    <Match when={state.rows.length === 0}>
                        <p class="empty-state">
                            No pronunciations on this page for {nameFor(search().source ?? "")} →{" "}
                            {nameFor(search().target ?? "")}.
                        </p>
                    </Match>
                    <Match when={state.rows.length > 0}>
                        <div
                            class={`result-list ${state.resultsStatus === "loading" ? "loading" : ""}`}
                        >
                            <div
                                class="table-results"
                                tabindex={0}
                                role="region"
                                aria-label="Pronunciations table"
                            >
                                <table>
                                    <colgroup>
                                        <col class="number-track" />
                                        <col />
                                        <col />
                                        <col />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th
                                                scope="col"
                                                class="number-column"
                                                aria-label="Number"
                                            >
                                                #
                                            </th>
                                            <th scope="col">Word</th>
                                            <th scope="col">Respelling</th>
                                            <th scope="col">IPA</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <For each={state.rows}>
                                            {(row, index) => (
                                                <tr>
                                                    <td class="number-column row-number">
                                                        {state.rowOffset + index() + 1}
                                                    </td>
                                                    <td class="word">
                                                        <bdi>{row.orthographic_form}</bdi>
                                                    </td>
                                                    <td>
                                                        <bdi>{row.respelling}</bdi>
                                                    </td>
                                                    <td class="ipa">
                                                        <bdi>{row.ipa}</bdi>
                                                    </td>
                                                </tr>
                                            )}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Match>
                </Switch>
                <Show
                    when={
                        state.resultsStatus === "ready" ||
                        (state.resultsStatus === "loading" && state.rows.length > 0)
                    }
                >
                    <nav aria-label="Pagination" class="pagination">
                        <button
                            type="button"
                            class="text-button"
                            disabled={state.pageIndex === 0 || state.resultsStatus === "loading"}
                            onClick={() => goToPage(state.pageIndex - 1)}
                        >
                            ← Previous
                        </button>
                        <span>Page {state.pageIndex + 1}</span>
                        <button
                            type="button"
                            class="text-button"
                            disabled={state.isDone || state.resultsStatus === "loading"}
                            onClick={() => goToPage(state.pageIndex + 1)}
                        >
                            Next →
                        </button>
                    </nav>
                </Show>
            </section>
        </div>
    );
}
