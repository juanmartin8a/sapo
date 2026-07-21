import { describe, expect, it } from "@jest/globals";

import {
    deleteUsageEventsByUserIdBatch,
    prepareQuotaPeriodsForUserDeletionBatch,
} from "../model/documents";

describe("subscription documents", () => {
    it("authoritatively deletes a processing usage event during account cleanup", async () => {
        const usageEvents = [
            {
                _id: "usage_event_1",
                user_id: "user_1",
                state: "processing",
            },
        ];
        const deletedIds: string[] = [];
        const ctx = {
            db: {
                query: (tableName: string) => {
                    expect(tableName).toBe("usage_events");
                    return {
                        withIndex: (
                            indexName: string,
                            buildQuery: (query: {
                                eq: (fieldName: string, value: unknown) => unknown;
                            }) => unknown
                        ) => {
                            expect(indexName).toBe("by_user_id_and_created_at_ms");
                            const query = {
                                eq: (fieldName: string, value: unknown) => {
                                    expect(fieldName).toBe("user_id");
                                    expect(value).toBe("user_1");
                                    return query;
                                },
                            };
                            buildQuery(query);

                            return {
                                take: async (limit: number) => usageEvents.slice(0, limit),
                            };
                        },
                    };
                },
                delete: async (id: string) => {
                    deletedIds.push(id);
                },
            },
        } as never;

        await expect(deleteUsageEventsByUserIdBatch(ctx, "user_1", 500)).resolves.toEqual({
            deleted_count: 1,
            has_more: false,
        });
        expect(deletedIds).toEqual(["usage_event_1"]);
    });

    it("looks beyond a preserved quota period when checking for another cleanup batch", async () => {
        const quotaPeriods = [
            { _id: "quota_1" },
            { _id: "quota_2" },
            { _id: "quota_preserved" },
            { _id: "quota_3" },
        ];
        let requestedLimit = 0;
        const ctx = {
            db: {
                query: (tableName: string) => {
                    expect(tableName).toBe("quota_periods");
                    return {
                        withIndex: (
                            indexName: string,
                            buildQuery: (query: {
                                eq: (fieldName: string, value: unknown) => unknown;
                            }) => unknown
                        ) => {
                            expect(indexName).toBe("by_user_id_and_period_start_at_ms");
                            const query = {
                                eq: (fieldName: string, value: unknown) => {
                                    expect(fieldName).toBe("user_id");
                                    expect(value).toBe("user_1");
                                    return query;
                                },
                            };
                            buildQuery(query);

                            return {
                                take: async (limit: number) => {
                                    requestedLimit = limit;
                                    return quotaPeriods.slice(0, limit);
                                },
                            };
                        },
                    };
                },
            },
        } as never;

        await expect(
            prepareQuotaPeriodsForUserDeletionBatch(ctx, {
                user_id: "user_1",
                preserved_quota_period_id: "quota_preserved" as never,
                delete_limit: 2,
            })
        ).resolves.toEqual({
            quota_periods: [{ _id: "quota_1" }, { _id: "quota_2" }],
            has_more: true,
        });
        expect(requestedLimit).toBe(4);
    });
});
