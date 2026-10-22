import { createEffect, createStore, onSettled, untrack } from "solid-js";
import { fetchData } from "@/lib/fetchData";
import type { Language, Pronunciation, PronunciationPage } from "@/lib/pronunciations";

type Status = "idle" | "loading" | "ready" | "error";

export function createPronunciationStore(pair: () => { source: string; target: string }) {
    const [state, setState] = createStore({
        mounted: false,
        languages: [] as Language[],
        languagesStatus: "loading" as Status,
        rows: [] as Pronunciation[],
        resultsStatus: "idle" as Status,
        pageIndex: 0,
        rowOffset: 0,
        isDone: true,
    });
    let cursors: (string | null)[] = [null];
    let offsets = [0];
    let requestedPage = 0;
    let requestId = 0;
    let languagesRequest: AbortController | undefined;
    let resultsRequest: AbortController | undefined;

    async function loadLanguages() {
        languagesRequest?.abort();
        const controller = new AbortController();
        languagesRequest = controller;
        setState((draft) => {
            draft.languagesStatus = "loading";
        });
        try {
            const languages = await fetchData<Language[]>("/api/languages", controller.signal);
            if (!state.mounted || controller.signal.aborted) return;
            setState((draft) => {
                draft.languages = languages;
                draft.languagesStatus = "ready";
            });
        } catch {
            if (!state.mounted || controller.signal.aborted) return;
            setState((draft) => {
                draft.languagesStatus = "error";
            });
        }
    }

    async function loadPage(index: number) {
        const { source, target } = pair();
        const cursor = cursors[index];
        if (!state.mounted || !source || !target || cursor === undefined) return;
        resultsRequest?.abort();
        const controller = new AbortController();
        resultsRequest = controller;
        const id = ++requestId;
        requestedPage = index;
        setState((draft) => {
            draft.resultsStatus = "loading";
        });
        try {
            const params = new URLSearchParams({ source, target });
            if (cursor !== null) params.set("cursor", cursor);
            const result = await fetchData<PronunciationPage>(
                `/api/pronunciations?${params}`,
                controller.signal,
            );
            if (!state.mounted || id !== requestId || controller.signal.aborted) return;
            const offset = offsets[index];
            cursors = cursors.slice(0, index + 1);
            offsets = offsets.slice(0, index + 1);
            if (result.nextCursor !== null) {
                cursors.push(result.nextCursor);
                offsets.push(offset + result.page.length);
            }
            setState((draft) => {
                draft.rows = result.page;
                draft.isDone = result.nextCursor === null;
                draft.pageIndex = index;
                draft.rowOffset = offset;
                draft.resultsStatus = "ready";
            });
        } catch {
            if (!state.mounted || id !== requestId || controller.signal.aborted) return;
            setState((draft) => {
                draft.resultsStatus = "error";
            });
        }
    }

    onSettled(() => {
        setState((draft) => {
            draft.mounted = true;
        });
        void loadLanguages();
        return () => {
            requestId++;
            languagesRequest?.abort();
            resultsRequest?.abort();
        };
    });

    createEffect(
        () => ({ mounted: state.mounted, ...pair() }),
        ({ mounted, source, target }) => {
            if (!mounted) return;
            requestId++;
            resultsRequest?.abort();
            cursors = [null];
            offsets = [0];
            requestedPage = 0;
            setState((draft) => {
                draft.pageIndex = 0;
                draft.rowOffset = 0;
                draft.rows = [];
                draft.resultsStatus = "idle";
            });
            if (source && target) untrack(() => void loadPage(0));
        },
    );

    return { state, loadLanguages, loadPage, retry: () => loadPage(requestedPage) };
}
