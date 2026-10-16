import { describe, expect, it } from "@jest/globals";

import {
    deleteResolvedOperationalAlertsEligibleForRetentionPurge,
    markOperationalAlertNotified,
    recordOperationalAlert,
} from "../model/operationalAlerts";

describe("operational alerts", () => {
    it("updates the most recent active alert without scanning resolved history", async () => {
        const queriedStatuses: string[] = [];
        const patches: { table: string; id: string; value: Record<string, unknown> }[] = [];
        const alerts = {
            open: {
                _id: "open_alert",
                status: "open",
                last_seen_at_ms: 100,
                next_notify_at_ms: 500,
                occurrence_count: 2,
            },
            acknowledged: {
                _id: "acknowledged_alert",
                status: "acknowledged",
                last_seen_at_ms: 200,
                next_notify_at_ms: 500,
                occurrence_count: 4,
            },
        };
        const ctx = {
            db: {
                query: (table: string) => {
                    expect(table).toBe("operational_alerts");
                    return {
                        withIndex: (
                            index: string,
                            buildQuery: (query: {
                                eq: (field: string, value: string) => unknown;
                            }) => unknown
                        ) => {
                            expect(index).toBe("by_kind_entity_key_status_and_last_seen_at_ms");
                            let status = "";
                            const query = {
                                eq: (field: string, value: string) => {
                                    if (field === "status") status = value;
                                    return query;
                                },
                            };
                            buildQuery(query);
                            queriedStatuses.push(status);
                            return {
                                order: (direction: string) => {
                                    expect(direction).toBe("desc");
                                    return {
                                        first: async () => alerts[status as keyof typeof alerts] ?? null,
                                    };
                                },
                            };
                        },
                    };
                },
                patch: async (table: string, id: string, value: Record<string, unknown>) => {
                    patches.push({ table, id, value });
                },
            },
        } as never;

        await expect(
            recordOperationalAlert(ctx, {
                kind: "revenuecat",
                entity_key: "user_1",
                severity: "error",
                title: "Sync failed",
                message: "RevenueCat synchronization failed",
                now_ms: 300,
            })
        ).resolves.toEqual({
            alert_id: "acknowledged_alert",
            should_notify: false,
        });
        expect(queriedStatuses).toEqual(["open", "acknowledged"]);
        expect(patches).toEqual([
            {
                table: "operational_alerts",
                id: "acknowledged_alert",
                value: {
                    severity: "error",
                    status: "open",
                    title: "Sync failed",
                    message: "RevenueCat synchronization failed",
                    occurrence_count: 5,
                    last_seen_at_ms: 300,
                },
            },
        ]);
    });

    it("records notification timestamps with the cooldown", async () => {
        const patches: { table: string; id: string; value: Record<string, unknown> }[] = [];
        const ctx = {
            db: {
                patch: async (table: string, id: string, value: Record<string, unknown>) => {
                    patches.push({ table, id, value });
                },
            },
        } as never;

        await expect(
            markOperationalAlertNotified(ctx, {
                alert_id: "alert_1" as never,
                now_ms: 1_000,
            })
        ).resolves.toBeNull();
        expect(patches).toEqual([
            {
                table: "operational_alerts",
                id: "alert_1",
                value: {
                    notified_at_ms: 1_000,
                    next_notify_at_ms: 21_601_000,
                },
            },
        ]);
    });

    it("floors purge limits and uses explicit table names for deletion", async () => {
        const deletedIds: string[] = [];
        let requestedLimit = 0;
        const ctx = {
            db: {
                query: (table: string) => {
                    expect(table).toBe("operational_alerts");
                    return {
                        withIndex: (
                            index: string,
                            buildQuery: (query: {
                                eq: (field: string, value: string) => unknown;
                                lte: (field: string, value: number) => unknown;
                            }) => unknown
                        ) => {
                            expect(index).toBe("by_status_and_resolved_at_ms");
                            const query = {
                                eq: () => query,
                                lte: () => query,
                            };
                            buildQuery(query);
                            return {
                                take: async (limit: number) => {
                                    requestedLimit = limit;
                                    return [{ _id: "resolved_alert", resolved_at_ms: 50 }];
                                },
                            };
                        },
                    };
                },
                delete: async (table: string, id: string) => {
                    expect(table).toBe("operational_alerts");
                    deletedIds.push(id);
                },
            },
        } as never;

        await expect(
            deleteResolvedOperationalAlertsEligibleForRetentionPurge(ctx, {
                older_than_ms: 100,
                limit: 10.9,
            })
        ).resolves.toEqual({ scanned_count: 1, deleted_count: 1 });
        expect(requestedLimit).toBe(10);
        expect(deletedIds).toEqual(["resolved_alert"]);
    });
});
