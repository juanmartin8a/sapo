import { components } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

const STREAM_STOP_POLL_INTERVAL_MS = 250;
const STREAM_CONTROL_HEARTBEAT_INTERVAL_MS = 5_000;
const STREAM_CONTROL_LEASE_DURATION_MS = 30_000;

export const STREAM_REGISTRATION_MISSING_USER_ERROR =
    "Cannot register sapopinguino stream for missing user";
export const STREAM_REGISTRATION_DELETION_ERROR =
    "Cannot register sapopinguino stream while user deletion is in progress";

export type SapopinguinoStreamOperation = "translate" | "respell";

function sleep(milliseconds: number, signal?: AbortSignal) {
    if (signal?.aborted) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;

        const cleanup = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener("abort", cleanup);
            resolve();
        };

        timeout = setTimeout(cleanup, milliseconds);
        signal?.addEventListener("abort", cleanup, { once: true });
    });
}

function getStreamControlLeaseExpiryMs(nowMs: number) {
    return nowMs + STREAM_CONTROL_LEASE_DURATION_MS;
}

async function getSapopinguinoUserProcessingState(ctx: ActionCtx, userId: string) {
    const [user, deletionOperationState] = await Promise.all([
        (ctx as any).runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
            where: [{ field: "_id", value: userId }],
        }) as Promise<{ _id: string } | null>,
        (ctx as any).runQuery(
            (components.subscriptions.webhook as Record<string, unknown>)
                .getUserDeletionOperationState,
            {
                user_id: userId,
            }
        ) as Promise<{ blocks_processing?: boolean }>,
    ]);

    if (!user) {
        return "missing_user" as const;
    }

    if (deletionOperationState.blocks_processing === true) {
        return "deletion_in_progress" as const;
    }

    return "allowed" as const;
}

async function assertSapopinguinoStreamRegistrationAllowed(ctx: ActionCtx, userId: string) {
    const processingState = await getSapopinguinoUserProcessingState(ctx, userId);

    if (processingState === "missing_user") {
        throw new Error(STREAM_REGISTRATION_MISSING_USER_ERROR);
    }

    if (processingState === "deletion_in_progress") {
        throw new Error(STREAM_REGISTRATION_DELETION_ERROR);
    }
}

export async function registerSapopinguinoStreamControl(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    const nowMs = Date.now();
    let registered = false;

    await assertSapopinguinoStreamRegistrationAllowed(ctx, userId);

    await (ctx as ActionCtx & {
        runMutation: (mutation: unknown, args: Record<string, unknown>) => Promise<unknown>;
    }).runMutation((components.sapopinguino.streamControl as Record<string, unknown>).registerStreamControl, {
        streamId,
        userId,
        operation,
        nowMs,
        leaseExpiresAtMs: getStreamControlLeaseExpiryMs(nowMs),
    });

    registered = true;

    try {
        await assertSapopinguinoStreamRegistrationAllowed(ctx, userId);
    } catch (error) {
        if (registered) {
            await clearSapopinguinoStreamControl(ctx, streamId, userId, operation).catch((clearError) => {
                console.error("Failed to clear blocked sapopinguino stream control:", clearError);
            });
        }

        throw error;
    }
}

async function refreshSapopinguinoStreamControlLease(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    const nowMs = Date.now();

    return (await (ctx as ActionCtx & {
        runMutation: (mutation: unknown, args: Record<string, unknown>) => Promise<unknown>;
    }).runMutation(
        (components.sapopinguino.streamControl as Record<string, unknown>).refreshStreamControlLease,
        {
            streamId,
            userId,
            operation,
            nowMs,
            leaseExpiresAtMs: getStreamControlLeaseExpiryMs(nowMs),
        }
    )) as {
        exists: boolean;
        action: "stop" | null;
    };
}

export async function clearSapopinguinoStreamControl(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    await ctx.runMutation(components.sapopinguino.streamControl.clearStreamControl, {
        streamId,
        userId,
        operation,
    });
}

export async function consumeSapopinguinoStreamStopAction(
    ctx: ActionCtx,
    streamId: string,
    userId: string,
    operation: SapopinguinoStreamOperation,
) {
    const result = await ctx.runMutation(components.sapopinguino.streamControl.consumeStreamControlAction, {
        streamId,
        userId,
        operation,
    });

    return result.action === "stop";
}

export async function monitorSapopinguinoStreamStopSignal(
    ctx: ActionCtx,
    args: {
        streamId: string;
        userId: string;
        operation: SapopinguinoStreamOperation;
        upstreamAbortController: AbortController;
        onStopRequested: () => void;
    },
) {
    let hasLoggedQueryFailure = false;

    while (!args.upstreamAbortController.signal.aborted) {
        try {
            const [streamControlStatus, userProcessingState] = await Promise.all([
                (ctx as any).runQuery(
                    (components.sapopinguino.streamControl as Record<string, unknown>)
                        .getStreamControlStatus,
                    {
                        streamId: args.streamId,
                        userId: args.userId,
                        operation: args.operation,
                    }
                ) as Promise<{ action: "stop" | null; exists: boolean }>,
                getSapopinguinoUserProcessingState(ctx, args.userId),
            ]);

            hasLoggedQueryFailure = false;

            if (
                !streamControlStatus.exists ||
                streamControlStatus.action === "stop" ||
                userProcessingState !== "allowed"
            ) {
                args.onStopRequested();

                if (!args.upstreamAbortController.signal.aborted) {
                    args.upstreamAbortController.abort();
                }

                return;
            }
        } catch (error) {
            if (!hasLoggedQueryFailure) {
                console.error("Failed to poll sapopinguino stream stop state:", error);
                hasLoggedQueryFailure = true;
            }
        }

        await sleep(STREAM_STOP_POLL_INTERVAL_MS, args.upstreamAbortController.signal);
    }
}

export async function maintainSapopinguinoStreamControlLease(
    ctx: ActionCtx,
    args: {
        streamId: string;
        userId: string;
        operation: SapopinguinoStreamOperation;
        upstreamAbortController: AbortController;
        onStopRequested: () => void;
    },
) {
    let hasLoggedRefreshFailure = false;

    while (!args.upstreamAbortController.signal.aborted) {
        try {
            const streamControlLease = await refreshSapopinguinoStreamControlLease(
                ctx,
                args.streamId,
                args.userId,
                args.operation
            );

            hasLoggedRefreshFailure = false;

            if (!streamControlLease.exists || streamControlLease.action === "stop") {
                args.onStopRequested();

                if (!args.upstreamAbortController.signal.aborted) {
                    args.upstreamAbortController.abort();
                }

                return;
            }
        } catch (error) {
            if (!hasLoggedRefreshFailure) {
                console.error("Failed to refresh sapopinguino stream control lease:", error);
                hasLoggedRefreshFailure = true;
            }
        }

        await sleep(STREAM_CONTROL_HEARTBEAT_INTERVAL_MS, args.upstreamAbortController.signal);
    }
}
