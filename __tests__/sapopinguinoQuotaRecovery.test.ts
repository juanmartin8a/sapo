import { describe, expect, it } from "@jest/globals";

import {
    classifySapopinguinoQuotaRecoveryResult,
    getSapopinguinoQuotaRecoveryDelayMs,
    getSapopinguinoQuotaRecoveryMaxAttempts,
    hasReachedSapopinguinoQuotaRecoveryAttemptLimit,
} from "../sapopinguinoQuotaRecovery";

describe("sapopinguino quota recovery helpers", () => {
    it("treats the requested terminal transition as success", () => {
        expect(
            classifySapopinguinoQuotaRecoveryResult({
                terminalState: "failed_after_charge",
                result: {
                    status: "failed_after_charge",
                },
            })
        ).toEqual({ kind: "succeeded" });
    });

    it("stops retrying when the usage event is already missing or terminal elsewhere", () => {
        expect(
            classifySapopinguinoQuotaRecoveryResult({
                terminalState: "completed",
                result: {
                    status: "missing",
                },
            })
        ).toEqual({ kind: "missing" });

        expect(
            classifySapopinguinoQuotaRecoveryResult({
                terminalState: "completed",
                result: {
                    status: "invalid_state",
                    state: "user_stopped_after_charge",
                },
            })
        ).toEqual({
            kind: "terminal_mismatch",
            state: "user_stopped_after_charge",
        });
    });

    it("keeps retrying while the usage event is still active or the result is malformed", () => {
        expect(
            classifySapopinguinoQuotaRecoveryResult({
                terminalState: "user_stopped_after_charge",
                result: {
                    status: "invalid_state",
                    state: "processing",
                },
            })
        ).toEqual({
            kind: "retry",
            reason: "usage_event_still_processing",
        });

        expect(
            classifySapopinguinoQuotaRecoveryResult({
                terminalState: "completed",
                result: {
                    status: "weird_status",
                },
            })
        ).toEqual({
            kind: "retry",
            reason: "unexpected_status:weird_status",
        });
    });

    it("uses capped exponential backoff for recovery retries", () => {
        expect(getSapopinguinoQuotaRecoveryDelayMs(0)).toBe(1_000);
        expect(getSapopinguinoQuotaRecoveryDelayMs(1)).toBe(2_000);
        expect(getSapopinguinoQuotaRecoveryDelayMs(2)).toBe(4_000);
        expect(getSapopinguinoQuotaRecoveryDelayMs(20)).toBe(5 * 60 * 1000);
    });

    it("caps durable recovery attempts before dead-lettering", () => {
        expect(getSapopinguinoQuotaRecoveryMaxAttempts()).toBe(8);
        expect(hasReachedSapopinguinoQuotaRecoveryAttemptLimit(7)).toBe(false);
        expect(hasReachedSapopinguinoQuotaRecoveryAttemptLimit(8)).toBe(true);
        expect(hasReachedSapopinguinoQuotaRecoveryAttemptLimit(100)).toBe(true);
    });
});
