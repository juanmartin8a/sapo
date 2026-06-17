import { describe, expect, it } from "@jest/globals";

import { getExclusiveLeaseOwnershipFailure } from "../leaseOwnership";

describe("exclusive lease ownership", () => {
    it("requires a caller attempt id", () => {
        expect(
            getExclusiveLeaseOwnershipFailure({
                current_attempt_id: "attempt_a",
                now_ms: 1_000,
                lease_expires_at_ms: 2_000,
            })
        ).toBe("owner_required");
    });

    it("rejects mismatched owners", () => {
        expect(
            getExclusiveLeaseOwnershipFailure({
                current_attempt_id: "attempt_a",
                attempt_id: "attempt_b",
                now_ms: 1_000,
                lease_expires_at_ms: 2_000,
            })
        ).toBe("owner_mismatch");
    });

    it("rejects expired owned leases", () => {
        expect(
            getExclusiveLeaseOwnershipFailure({
                current_attempt_id: "attempt_a",
                attempt_id: "attempt_a",
                now_ms: 2_000,
                lease_expires_at_ms: 2_000,
            })
        ).toBe("lease_expired");
    });

    it("allows the current owner before expiry", () => {
        expect(
            getExclusiveLeaseOwnershipFailure({
                current_attempt_id: "attempt_a",
                attempt_id: "attempt_a",
                now_ms: 1_000,
                lease_expires_at_ms: 2_000,
            })
        ).toBeNull();
    });
});
