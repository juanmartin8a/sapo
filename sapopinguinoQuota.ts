import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./subscriptions/_generated/dataModel";
import type { SubscriptionUsageOperation } from "./constants/subscriptions";

export type SapopinguinoQuotaOperation = SubscriptionUsageOperation;
export type SapopinguinoQuotaOutcome = "completed" | "failed";

type UntypedMutationRunner = {
    runMutation: (mutation: unknown, args: Record<string, unknown>) => Promise<unknown>;
};

const subscriptionsWebhook = components.subscriptions.webhook as Record<string, unknown>;

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

export async function finalizeSapopinguinoQuota(
    ctx: ActionCtx,
    args: {
        usageEventId: Id<"usage_events">;
        outcome: SapopinguinoQuotaOutcome;
        logContext: string;
    }
) {
    const mutationRunner = ctx as ActionCtx & UntypedMutationRunner;

    try {
        const result = (await mutationRunner.runMutation(
            args.outcome === "completed"
                ? subscriptionsWebhook.completeSubscriptionQuotaUsage
                : subscriptionsWebhook.markSubscriptionQuotaUsageFailed,
            {
                usage_event_id: args.usageEventId,
                now_ms: Date.now(),
            }
        )) as { status: string };

        if (result.status === args.outcome) {
            return true;
        }

        logUnexpectedQuotaTransition("sapopinguino_quota_finalize_unexpected_state", result);
    } catch (error) {
        console.error(`Failed to finalize ${args.logContext} quota:`, error);
    }

    return false;
}
