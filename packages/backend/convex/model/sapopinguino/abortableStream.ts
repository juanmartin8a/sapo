export function createAbortableStream<T>(
    start: (
        controller: ReadableStreamDefaultController<T>,
        upstream: { signal: AbortSignal; abort: () => void }
    ) => Promise<void> | void
) {
    const upstreamAbortController = new AbortController();
    const abort = () => {
        if (!upstreamAbortController.signal.aborted) {
            upstreamAbortController.abort();
        }
    };

    return new ReadableStream<T>({
        start: (controller) => start(controller, { signal: upstreamAbortController.signal, abort }),
        cancel: abort,
    });
}
