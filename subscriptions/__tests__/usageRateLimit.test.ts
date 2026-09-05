import { describe, expect, it, jest } from "@jest/globals";

import { reserveSubscriptionQuotaUsage } from "../model/webhook";
import { isUsageRequestRateLimited } from "../model/usageRateLimit";

type UsageRow = { user_id: string; state: string; created_at_ms: number };

function createContext(rows: UsageRow[]) {
    const reads: number[] = [];
    return {
        reads,
        ctx: {
            db: {
                query: (table: string) => {
                    expect(["usage_events", "user_deletion_queue"]).toContain(table);
                    return {
                        withIndex: (_index: string, buildRange: (range: { eq: (field: keyof UsageRow, value: unknown) => unknown; gt: (field: "created_at_ms", value: number) => unknown }) => unknown) => {
                            const filters: ((row: UsageRow) => boolean)[] = [];
                            const range = {
                                eq: (field: keyof UsageRow, value: unknown) => {
                                    filters.push((row) => row[field] === value);
                                    return range;
                                },
                                gt: (field: "created_at_ms", value: number) => {
                                    filters.push((row) => row[field] > value);
                                    return range;
                                },
                            };
                            buildRange(range);
                            return {
                                collect: async () => [],
                                first: async () => null,
                                take: jest.fn(async (limit: number) => {
                                    const result = rows.filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
                                    reads.push(result.length);
                                    return result;
                                }),
                            };
                        },
                    };
                },
            },
        },
    };
}

describe("usage rate limits", () => {
    it("blocks three concurrent requests regardless of operation or age", async () => {
        const { ctx, reads } = createContext(Array.from({ length: 1_000 }, () => ({
            user_id: "user_1", state: "processing", created_at_ms: 0,
        })));
        await expect(isUsageRequestRateLimited(ctx as never, "user_1", 60_000)).resolves.toBe(true);
        expect(reads).toEqual([3]);
    });

    it("rejects a burst before creating quota counters or scheduling upstream work", async () => {
        const { ctx } = createContext(Array.from({ length: 3 }, () => ({
            user_id: "user_1", state: "processing", created_at_ms: 1,
        })));
        await expect(reserveSubscriptionQuotaUsage(ctx as never, {
            user_id: "user_1",
            req_id: "translate:new",
            operation: "translate",
            input_char_count: 1,
            now_ms: 60_000,
        })).resolves.toEqual({ allowed: false, reason: "request_rate_limited" });
    });

    it("counts failed and completed attempts in the rolling minute", async () => {
        const { ctx, reads } = createContext(Array.from({ length: 1_000 }, (_, index) => ({
            user_id: "user_1", state: index % 2 ? "failed" : "completed", created_at_ms: 1,
        })));
        await expect(isUsageRequestRateLimited(ctx as never, "user_1", 60_000)).resolves.toBe(true);
        expect(reads).toEqual([0, 30]);
    });

    it("allows requests below the limit and excludes other users and expired attempts", async () => {
        const { ctx } = createContext([
            ...Array.from({ length: 29 }, () => ({ user_id: "user_1", state: "completed", created_at_ms: 1 })),
            { user_id: "user_1", state: "failed", created_at_ms: 0 },
            ...Array.from({ length: 100 }, () => ({ user_id: "user_2", state: "processing", created_at_ms: 1 })),
        ]);
        await expect(isUsageRequestRateLimited(ctx as never, "user_1", 60_000)).resolves.toBe(false);
    });
});
