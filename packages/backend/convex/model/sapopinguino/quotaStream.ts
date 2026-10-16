import type { ActionCtx } from "../../_generated/server";
import { ABORT_ERROR_NAME } from "../../constants/errors";
import type { Id } from "../../subscriptions/_generated/dataModel";
import { createAbortableStream } from "./abortableStream";
import { chargeSapopinguinoQuota, finalizeSapopinguinoQuota } from "./quota";
import { closeStreamOutput } from "./streamOutput";

type QuotaStreamControls = {
    controller: ReadableStreamDefaultController<Uint8Array>;
    upstream: AbortController;
    ensureQuotaCharged: () => Promise<boolean>;
    hasChargedQuota: () => boolean;
};

export function createSapopinguinoQuotaStream(
    ctx: ActionCtx,
    request: Request,
    args: {
        usage_event_id: Id<"usage_events">;
        log_context: string;
        run: (controls: QuotaStreamControls) => Promise<"completed" | "errored">;
        on_unexpected_error: (
            controller: ReadableStreamDefaultController<Uint8Array>
        ) => void;
    }
) {
    return createAbortableStream<Uint8Array>(async (controller, upstream) => {
        let hasChargedQuota = false;
        if (request.signal.aborted) {
            upstream.abort();
        } else {
            request.signal.addEventListener("abort", upstream.abort, { once: true });
        }

        const ensureQuotaCharged = async () => {
            if (hasChargedQuota) {
                return true;
            }

            const charged = await chargeSapopinguinoQuota(ctx, args.usage_event_id);
            if (charged) {
                hasChargedQuota = true;
            }

            return charged;
        };
        const finalize = (outcome: "completed" | "failed") =>
            finalizeSapopinguinoQuota(ctx, {
                usageEventId: args.usage_event_id,
                outcome,
                logContext: args.log_context,
            });

        try {
            const streamResult = await args.run({
                controller,
                upstream,
                ensureQuotaCharged,
                hasChargedQuota: () => hasChargedQuota,
            });

            await finalize(
                streamResult === "completed" && hasChargedQuota ? "completed" : "failed"
            );
        } catch (error) {
            await finalize("failed");
            if ((error as Error).name !== ABORT_ERROR_NAME) {
                args.on_unexpected_error(controller);
            }
        } finally {
            request.signal.removeEventListener("abort", upstream.abort);
            upstream.abort();
            closeStreamOutput(controller);
        }
    });
}
