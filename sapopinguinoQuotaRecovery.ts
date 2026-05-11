import type { SapopinguinoQuotaTerminalState } from "./sapopinguinoQuota";

const ACTIVE_USAGE_EVENT_STATES = new Set(["reserved", "processing"]);
const TERMINAL_USAGE_EVENT_STATES = new Set([
    "completed",
    "failed_before_charge",
    "failed_after_charge",
    "user_stopped_before_charge",
    "user_stopped_after_charge",
]);
const QUOTA_RECOVERY_INITIAL_DELAY_MS = 1_000;
const QUOTA_RECOVERY_MAX_DELAY_MS = 5 * 60 * 1000;
const QUOTA_RECOVERY_MAX_ATTEMPTS = 8;

export type SapopinguinoQuotaRecoveryDisposition =
    | { kind: "succeeded" }
    | { kind: "missing" }
    | {
          kind: "retry";
          reason: string;
      }
    | {
          kind: "terminal_mismatch";
          state: string;
      };

function resolveExpectedTerminalStatus(terminalState: SapopinguinoQuotaTerminalState) {
    return terminalState;
}

function resolveTransitionResultFields(result: unknown) {
    if (typeof result !== "object" || result === null) {
        return {
            status: null,
            state: null,
        };
    }

    const transitionResult = result as {
        status?: unknown;
        state?: unknown;
    };

    return {
        status: typeof transitionResult.status === "string" ? transitionResult.status : null,
        state: typeof transitionResult.state === "string" ? transitionResult.state : null,
    };
}

export function classifySapopinguinoQuotaRecoveryResult(args: {
    terminalState: SapopinguinoQuotaTerminalState;
    result: unknown;
}): SapopinguinoQuotaRecoveryDisposition {
    const { status, state } = resolveTransitionResultFields(args.result);

    if (status === resolveExpectedTerminalStatus(args.terminalState)) {
        return { kind: "succeeded" };
    }

    if (status === "missing") {
        return { kind: "missing" };
    }

    if (status === "invalid_state") {
        if (typeof state === "string" && TERMINAL_USAGE_EVENT_STATES.has(state)) {
            return {
                kind: "terminal_mismatch",
                state,
            };
        }

        if (typeof state === "string" && ACTIVE_USAGE_EVENT_STATES.has(state)) {
            return {
                kind: "retry",
                reason: `usage_event_still_${state}`,
            };
        }

        return {
            kind: "retry",
            reason: "invalid_state",
        };
    }

    return {
        kind: "retry",
        reason: status === null ? "missing_status" : `unexpected_status:${status}`,
    };
}

export function getSapopinguinoQuotaRecoveryDelayMs(attempt: number) {
    const safeAttempt = Math.max(0, Math.floor(attempt));
    return Math.min(
        QUOTA_RECOVERY_INITIAL_DELAY_MS * 2 ** safeAttempt,
        QUOTA_RECOVERY_MAX_DELAY_MS
    );
}

export function getSapopinguinoQuotaRecoveryMaxAttempts() {
    return QUOTA_RECOVERY_MAX_ATTEMPTS;
}

export function hasReachedSapopinguinoQuotaRecoveryAttemptLimit(attempt: number) {
    return Math.max(0, Math.floor(attempt)) >= QUOTA_RECOVERY_MAX_ATTEMPTS;
}
