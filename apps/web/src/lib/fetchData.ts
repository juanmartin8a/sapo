/** Fetch JSON with cancellation and a deadline covering the response body too. */
export async function fetchData<T>(
    url: string,
    signal: AbortSignal,
    fetchFn: typeof fetch = fetch,
): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
        () => controller.abort(new DOMException("Database request timed out.", "TimeoutError")),
        15_000,
    );
    try {
        const response = await fetchFn(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Database request failed.");
        return await response.json();
    } catch (error) {
        // An HTTP error can arrive before its body finishes. Release that connection.
        controller.abort();
        throw error;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
    }
}
