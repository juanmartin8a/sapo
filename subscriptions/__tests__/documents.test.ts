import { describe, expect, it, jest } from "@jest/globals";

import {
    deleteUsageEventsByUserIdBatch,
    getLatestSubscriptionStateByUserId,
    prepareQuotaPeriodsForUserDeletionBatch,
} from "../model/documents";
import { getRevenueCatEventUser } from "../model/revenueCatEventUserDocuments";
import { ingestRevenueCatEvent } from "../model/webhook";

describe("subscription documents", () => {
    it("fails loudly when a user has duplicate subscription states", async () => {
        const duplicateError = new Error("query returned more than one document");
        const unique = jest.fn(async () => {
            throw duplicateError;
        });
        const ctx = {
            db: {
                query: jest.fn(() => ({
                    withIndex: jest.fn((indexName: string) => {
                        expect(indexName).toBe("by_user_id");
                        return { unique };
                    }),
                })),
            },
        };

        await expect(getLatestSubscriptionStateByUserId(ctx as never, "user_1"))
            .rejects.toBe(duplicateError);
        expect(unique).toHaveBeenCalledTimes(1);
    });

    it("fails loudly when a RevenueCat event id is duplicated", async () => {
        const duplicateError = new Error("query returned more than one document");
        const ctx = {
            db: {
                query: jest.fn(() => ({
                    withIndex: jest.fn(() => ({
                        unique: jest.fn(async () => {
                            throw duplicateError;
                        }),
                    })),
                })),
            },
        };

        await expect(ingestRevenueCatEvent(ctx as never, {
            normalized_event: {
                event_id: "event_1",
                event_type: "RENEWAL",
                event_at_ms: 1_000,
                aliases: [],
                transferred_from: [],
                transferred_to: [],
                entitlement_ids: [],
            },
            received_at_ms: 1_000,
        })).rejects.toBe(duplicateError);
    });

    it("fails loudly when an event has duplicate links for one user", async () => {
        const duplicateError = new Error("query returned more than one document");
        const range = {
            eq: jest.fn(),
        };
        range.eq.mockReturnValue(range);
        const ctx = {
            db: {
                query: jest.fn(() => ({
                    withIndex: jest.fn((_indexName: string, buildRange: (query: typeof range) => unknown) => {
                        buildRange(range);
                        return {
                            unique: jest.fn(async () => {
                                throw duplicateError;
                            }),
                        };
                    }),
                })),
            },
        };

        await expect(getRevenueCatEventUser(
            ctx as never,
            "event_doc_1" as never,
            "user_1"
        )).rejects.toBe(duplicateError);
        expect(range.eq).toHaveBeenNthCalledWith(1, "event_doc_id", "event_doc_1");
        expect(range.eq).toHaveBeenNthCalledWith(2, "user_id", "user_1");
    });

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
                delete: async (tableName: string, id: string) => {
                    expect(tableName).toBe("usage_events");
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
