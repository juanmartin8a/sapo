export function tryEnqueueStreamOutput(
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    output: string
) {
    try {
        controller.enqueue(encoder.encode(output));
        return true;
    } catch {
        return false;
    }
}

export function closeStreamOutput(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
        controller.close();
    } catch {
        // The client may have already disconnected.
    }
}
