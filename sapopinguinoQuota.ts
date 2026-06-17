import { components, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./subscriptions/_generated/dataModel";

import {
    classifySapopinguinoQuotaRecoveryResult,
    getSapopinguinoQuotaRecoveryDelayMs,
} from "./sapopinguinoQuotaRecovery";

export type SapopinguinoQuotaOperation = "translate" | "respell";
export type SapopinguinoQuotaTerminalState =
    | "completed"
    | "failed_before_charge"
    | "failed_after_charge"
    | "user_stopped_before_charge"
    | "user_stopped_after_charge";

type UntypedMutationRunner = {
    runMutation: (mutation: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

type UntypedSchedulerRunner = {
    scheduler: {
        runAfter: (delayMs: number, fn: unknown, args: Record<string, unknown>) => Promise<unknown>;
    };
};

const subscriptionsWebhook = components.subscriptions.webhook as Record<string, unknown>;
const subscriptionsQuotaRecovery = (components.subscriptions as Record<string, unknown>)
    .quotaRecovery as Record<string, unknown>;
const QUOTA_FINALIZATION_RETRY_ATTEMPTS = 3;
const QUOTA_FINALIZATION_RETRY_DELAY_MS = 150;

type ReserveSapopinguinoQuotaResult =
    | {
          status: "reserved";
          usageEventId: Id<"usage_events">;
      }
    | {
          status: "blocked";
          httpStatus: 409 | 429;
          reason: string;
      }
    | {
          status: "error";
      };

function logUnexpectedQuotaTransition(event: string, result: unknown) {
    console.error(
        JSON.stringify({
            event,
            result,
        })
    );
}

function sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function buildSapopinguinoQuotaRequestId(
    operation: SapopinguinoQuotaOperation,
    streamId: string
) {
    return `${operation}:${streamId}`;
}

export function resolveSapopinguinoInputCharacterCount(inputPayload: string) {
    try {
        const parsed = JSON.parse(inputPayload) as unknown;

        if (typeof parsed === "object" && parsed !== null && "input" in parsed) {
            const inputValue = (parsed as { input?: unknown }).input;

            if (typeof inputValue === "string") {
                return Array.from(inputValue).length;
            }
        }
    } catch {
        return Array.from(inputPayload).length;
    }

    return Array.from(inputPayload).length;
}

export async function reserveSapopinguinoQuota(
    ctx: ActionCtx,
    args: {
        userId: string;
        operation: SapopinguinoQuotaOperation;
        input: string;
        streamId: string;
        signupAtMs?: number;
    }
): Promise<ReserveSapopinguinoQuotaResult> {
    const inputCharCount = resolveSapopinguinoInputCharacterCount(args.input);
    const nowMs = Date.now();
    const mutationRunner = ctx as ActionCtx & UntypedMutationRunner;

    let reservationResult:
        | {
              allowed: true;
              usage_event_id: Id<"usage_events">;
          }
        | {
              allowed: false;
              reason: string;
          };

    try {
        reservationResult = (await mutationRunner.runMutation(
            subscriptionsWebhook.reserveSubscriptionQuotaUsage,
            {
                req_id: buildSapopinguinoQuotaRequestId(args.operation, args.streamId),
                user_id: args.userId,
                operation: args.operation,
                input_char_count: inputCharCount,
                signup_at_ms: args.signupAtMs,
                now_ms: nowMs,
            }
        )) as typeof reservationResult;
    } catch (error) {
        console.error("Failed to reserve sapopinguino quota:", error);

        return {
            status: "error",
        };
    }

    if (!reservationResult.allowed) {
        const httpStatus =
            reservationResult.reason === "duplicate_req_id" ||
            reservationResult.reason === "user_deletion_in_progress"
                ? 409
                : 429;

        return {
            status: "blocked",
            httpStatus,
            reason: reservationResult.reason,
        };
    }

    return {
        status: "reserved",
        usageEventId: reservationResult.usage_event_id,
    };
}

export async function chargeSapopinguinoQuota(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">
) {
    const mutationRunner = ctx as ActionCtx & UntypedMutationRunner;
    const result = (await mutationRunner.runMutation(subscriptionsWebhook.chargeSubscriptionQuotaUsage, {
        usage_event_id: usageEventId,
        now_ms: Date.now(),
    })) as { status: string };

    if (result.status === "charged" || result.status === "already_charged") {
        return true;
    }

    logUnexpectedQuotaTransition("sapopinguino_quota_charge_unexpected_state", result);
    return false;
}

export async function completeSapopinguinoQuota(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">
) {
    const result = (await applySapopinguinoQuotaTerminalTransition(
        ctx,
        usageEventId,
        "completed"
    )) as { status: string };

    if (result.status === "completed") {
        return true;
    }

    logUnexpectedQuotaTransition("sapopinguino_quota_complete_unexpected_state", result);
    return false;
}

export async function failSapopinguinoQuota(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">,
    afterCharge: boolean
) {
    const expectedStatus = afterCharge ? "failed_after_charge" : "failed_before_charge";
    const result = (await applySapopinguinoQuotaTerminalTransition(
        ctx,
        usageEventId,
        expectedStatus
    )) as { status: string };

    if (result.status === expectedStatus) {
        return true;
    }

    logUnexpectedQuotaTransition("sapopinguino_quota_fail_unexpected_state", result);
    return false;
}

export async function stopSapopinguinoQuota(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">,
    afterCharge: boolean
) {
    const expectedStatus = afterCharge
        ? "user_stopped_after_charge"
        : "user_stopped_before_charge";
    const result = (await applySapopinguinoQuotaTerminalTransition(
        ctx,
        usageEventId,
        expectedStatus
    )) as { status: string };

    if (result.status === expectedStatus) {
        return true;
    }

    logUnexpectedQuotaTransition("sapopinguino_quota_stop_unexpected_state", result);
    return false;
}

async function applySapopinguinoQuotaTerminalTransition(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">,
    terminalState: SapopinguinoQuotaTerminalState
) {
    const mutationRunner = ctx as ActionCtx & UntypedMutationRunner;

    switch (terminalState) {
        case "completed":
            return mutationRunner.runMutation(subscriptionsWebhook.completeSubscriptionQuotaUsage, {
                usage_event_id: usageEventId,
                now_ms: Date.now(),
            });
        case "failed_before_charge":
            return mutationRunner.runMutation(subscriptionsWebhook.markSubscriptionQuotaUsageFailed, {
                usage_event_id: usageEventId,
                after_charge: false,
                now_ms: Date.now(),
            });
        case "failed_after_charge":
            return mutationRunner.runMutation(subscriptionsWebhook.markSubscriptionQuotaUsageFailed, {
                usage_event_id: usageEventId,
                after_charge: true,
                now_ms: Date.now(),
            });
        case "user_stopped_before_charge":
            return mutationRunner.runMutation(subscriptionsWebhook.markSubscriptionQuotaUsageStopped, {
                usage_event_id: usageEventId,
                after_charge: false,
                now_ms: Date.now(),
            });
        case "user_stopped_after_charge":
            return mutationRunner.runMutation(subscriptionsWebhook.markSubscriptionQuotaUsageStopped, {
                usage_event_id: usageEventId,
                after_charge: true,
                now_ms: Date.now(),
            });
    }
}

async function applySapopinguinoQuotaTerminalState(
    ctx: ActionCtx,
    usageEventId: Id<"usage_events">,
    terminalState: SapopinguinoQuotaTerminalState
) {
    const result = await applySapopinguinoQuotaTerminalTransition(ctx, usageEventId, terminalState);
    const disposition = classifySapopinguinoQuotaRecoveryResult({
        terminalState,
        result,
    });

    return disposition.kind === "succeeded" || disposition.kind === "missing";
}

async function enqueueSapopinguinoQuotaFinalizationRecovery(
    ctx: ActionCtx,
    args: {
        usageEventId: Id<"usage_events">;
        terminalState: SapopinguinoQuotaTerminalState;
        nowMs: number;
        nextRetryAtMs: number;
        lastError?: string;
    }
) {
    return (await (ctx as ActionCtx & UntypedMutationRunner).runMutation(
        subscriptionsQuotaRecovery.enqueueQuotaFinalizationRecovery,
        {
            usageEventId: args.usageEventId,
            terminalState: args.terminalState,
            nowMs: args.nowMs,
            nextRetryAtMs: args.nextRetryAtMs,
            ...(typeof args.lastError === "string" ? { lastError: args.lastError } : {}),
        }
    )) as {
        attempt_count: number;
        next_retry_at_ms: number;
        lease_expires_at_ms?: number;
        status: "pending" | "dead_letter" | "missing_usage_event" | "lease_active";
    };
}

async function scheduleSapopinguinoQuotaFinalizationRecoveryProcessing(
    ctx: ActionCtx,
    args: {
        usageEventId: Id<"usage_events">;
        delayMs: number;
    }
) {
    await (ctx as ActionCtx & UntypedSchedulerRunner).scheduler.runAfter(
        args.delayMs,
        ((internal as Record<string, unknown>).sapopinguinoWorkers as Record<string, unknown>)
            .processSapopinguinoQuotaFinalizationRecovery,
        {
            usage_event_id: args.usageEventId,
        }
    );
}

export async function finalizeSapopinguinoQuota(
    ctx: ActionCtx,
    args: {
        usageEventId: Id<"usage_events">;
        terminalState: SapopinguinoQuotaTerminalState;
        logContext: string;
    }
) {
    let lastError: unknown = null;
    const nowMs = Date.now();

    for (let attempt = 0; attempt < QUOTA_FINALIZATION_RETRY_ATTEMPTS; attempt += 1) {
        try {
            if (
                await applySapopinguinoQuotaTerminalState(ctx, args.usageEventId, args.terminalState)
            ) {
                return true;
            }

            lastError = new Error(
                `Unexpected sapopinguino quota terminal transition: ${args.terminalState}`
            );
        } catch (error) {
            lastError = error;
        }

        if (attempt < QUOTA_FINALIZATION_RETRY_ATTEMPTS - 1) {
            await sleep(QUOTA_FINALIZATION_RETRY_DELAY_MS);
        }
    }

    const recoveryAttempt = 0;
    const recoveryDelayMs = getSapopinguinoQuotaRecoveryDelayMs(recoveryAttempt);
    const errorMessage =
        lastError instanceof Error && lastError.message.trim().length > 0
            ? lastError.message.slice(0, 400)
            : `Unexpected sapopinguino quota terminal transition: ${args.terminalState}`;

    try {
        const enqueueResult = await enqueueSapopinguinoQuotaFinalizationRecovery(ctx, {
            usageEventId: args.usageEventId,
            terminalState: args.terminalState,
            nowMs,
            nextRetryAtMs: nowMs + recoveryDelayMs,
            lastError: errorMessage,
        });

        if (enqueueResult.status === "missing_usage_event") {
            return true;
        }

        if (enqueueResult.status === "lease_active") {
            try {
                await scheduleSapopinguinoQuotaFinalizationRecoveryProcessing(ctx, {
                    usageEventId: args.usageEventId,
                    delayMs: Math.max(0, (enqueueResult.lease_expires_at_ms ?? nowMs) - Date.now()),
                });
            } catch (scheduleError) {
                console.error(
                    `Failed to schedule ${args.logContext} quota recovery after active lease:`,
                    scheduleError
                );
            }

            console.warn(`Skipped ${args.logContext} quota recovery enqueue because a lease is active`, {
                terminalState: args.terminalState,
                usageEventId: args.usageEventId,
                leaseExpiresAtMs: enqueueResult.lease_expires_at_ms,
            });

            return false;
        }
    } catch (enqueueError) {
        console.error(`Failed to enqueue ${args.logContext} quota finalization recovery:`, enqueueError);
        console.error(`Last ${args.logContext} quota finalization error:`, lastError);

        return false;
    }

    try {
        await scheduleSapopinguinoQuotaFinalizationRecoveryProcessing(ctx, {
            usageEventId: args.usageEventId,
            delayMs: recoveryDelayMs,
        });
    } catch (scheduleError) {
        console.error(`Failed to schedule ${args.logContext} quota finalization recovery:`, scheduleError);
    }

    console.warn(`Queued ${args.logContext} quota finalization recovery`, {
        terminalState: args.terminalState,
        usageEventId: args.usageEventId,
    });
    return false;
}
