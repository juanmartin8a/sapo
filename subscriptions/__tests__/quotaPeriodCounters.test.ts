import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldBlockQuotaUsageForPeriod } from "../model/quotaAvailability";
import {
    INPUT_CHARACTERS_QUOTA_UNIT,
    applyQuotaPeriodCounterCharge,
    getOrCreateQuotaPeriodCounter,
    resolveQuotaCounterReservationSnapshot,
    shouldRejectQuotaInputBeforeCounterCreation,
} from "../model/quotaPeriodCounters";

type FakeCounterDoc = {
    _id: string;
    _creationTime: number;
    quota_period_id: string;
    operation: "translate" | "respell";
    quota_unit: "input_characters";
    charged_units: number;
    input_limit: number;
    period_limit: number;
    last_charged_at_ms?: number;
    created_at_ms: number;
    updated_at_ms: number;
};

function createFakeCounterCtx(initialCounters: FakeCounterDoc[] = []) {
    const countersById = new Map<string, FakeCounterDoc>(
        initialCounters.map((counter) => [counter._id, counter])
    );
    let nextId = countersById.size + 1;

    return {
        countersById,
        ctx: {
            db: {
                query: (tableName: string) => {
                    expect(tableName).toBe("quota_period_counters");

                    return {
                        withIndex: (
                            _indexName: string,
                            buildQuery: (query: {
                                eq: (fieldName: string, value: unknown) => unknown;
                            }) => unknown
                        ) => {
                            const filters: [string, unknown][] = [];
                            const query = {
                                eq: (fieldName: string, value: unknown) => {
                                    filters.push([fieldName, value]);
                                    return query;
                                },
                            };

                            buildQuery(query);

                            return {
                                collect: async () =>
                                    [...countersById.values()].filter((counter) =>
                                        filters.every(
                                            ([fieldName, value]) =>
                                                counter[fieldName as keyof FakeCounterDoc] === value
                                        )
                                    ),
                            };
                        },
                    };
                },
                insert: async (tableName: string, document: Omit<FakeCounterDoc, "_id" | "_creationTime">) => {
                    expect(tableName).toBe("quota_period_counters");

                    const id = `counter_${nextId}`;
                    nextId += 1;
                    countersById.set(id, {
                        _id: id,
                        _creationTime: nextId,
                        ...document,
                    });

                    return id;
                },
                get: async (id: string) => countersById.get(id) ?? null,
                patch: async (id: string, patch: Partial<FakeCounterDoc>) => {
                    const counter = countersById.get(id);

                    if (!counter) {
                        throw new Error(`Missing fake counter ${id}`);
                    }

                    countersById.set(id, {
                        ...counter,
                        ...patch,
                    });
                },
                delete: async (id: string) => {
                    countersById.delete(id);
                },
            },
        } as never,
    };
}

describe("quota period counters", () => {
    it("rejects oversized input before a counter must be created", () => {
        expect(
            shouldRejectQuotaInputBeforeCounterCreation({
                input_char_count: 1_001,
                input_limit: 1_000,
            })
        ).toBe(true);

        expect(
            shouldRejectQuotaInputBeforeCounterCreation({
                input_char_count: 1_000,
                input_limit: 1_000,
            })
        ).toBe(false);
    });

    it("creates the matching counter row lazily and idempotently", async () => {
        const { ctx, countersById } = createFakeCounterCtx();

        const firstCounter = await getOrCreateQuotaPeriodCounter(ctx, {
            quota_period_id: "quota_period_1" as never,
            operation: "translate",
            quota_unit: INPUT_CHARACTERS_QUOTA_UNIT,
            input_limit: 1_000,
            period_limit: 10_000,
            now_ms: 1_000,
        });
        const secondCounter = await getOrCreateQuotaPeriodCounter(ctx, {
            quota_period_id: "quota_period_1" as never,
            operation: "translate",
            quota_unit: INPUT_CHARACTERS_QUOTA_UNIT,
            input_limit: 1_000,
            period_limit: 10_000,
            now_ms: 2_000,
        });

        expect(countersById.size).toBe(1);
        expect(secondCounter._id).toBe(firstCounter._id);
        expect(firstCounter).toMatchObject({
            quota_period_id: "quota_period_1",
            operation: "translate",
            quota_unit: "input_characters",
            charged_units: 0,
            input_limit: 1_000,
            period_limit: 10_000,
            created_at_ms: 1_000,
            updated_at_ms: 1_000,
        });
    });

    it("builds reservation state from counter limits and charged units", () => {
        const reservationSnapshot = resolveQuotaCounterReservationSnapshot({
            counter: {
                charged_units: 900,
                input_limit: 250,
                period_limit: 1_000,
            },
            outstanding_units: 75,
        });

        expect(reservationSnapshot).toEqual({
            charged_units: 900,
            input_limit: 250,
            period_limit: 1_000,
            used_chars: 975,
        });
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: reservationSnapshot.used_chars,
                period_limit: reservationSnapshot.period_limit,
            })
        ).toBe(false);
        expect(
            shouldBlockQuotaUsageForPeriod({
                used_chars: 1_000,
                period_limit: reservationSnapshot.period_limit,
            })
        ).toBe(true);
    });

    it("increments charged units on the counter row", async () => {
        const { ctx, countersById } = createFakeCounterCtx([
            {
                _id: "counter_1",
                _creationTime: 1,
                quota_period_id: "quota_period_1",
                operation: "respell",
                quota_unit: "input_characters",
                charged_units: 100,
                input_limit: 300,
                period_limit: 6_000,
                created_at_ms: 1_000,
                updated_at_ms: 1_000,
            },
        ]);
        const counter = countersById.get("counter_1");

        if (!counter) {
            throw new Error("Missing fake counter fixture");
        }

        await applyQuotaPeriodCounterCharge(ctx, {
            counter: counter as never,
            charged_units: 42,
            now_ms: 2_000,
        });

        expect(countersById.get("counter_1")).toMatchObject({
            charged_units: 142,
            last_charged_at_ms: 2_000,
            updated_at_ms: 2_000,
        });
    });

    it("does not define operation aggregate fields on quota_periods", () => {
        const schemaSource = readFileSync(join(__dirname, "../schema.ts"), "utf8");
        const quotaPeriodsTable = schemaSource.match(
            /quota_periods:\s*defineTable\(\{([\s\S]*?)\n\s*\}\)\n\s*\.index/
        )?.[1];

        expect(quotaPeriodsTable).toBeDefined();
        expect(quotaPeriodsTable).not.toContain("translate_charged_chars");
        expect(quotaPeriodsTable).not.toContain("respell_charged_chars");
        expect(quotaPeriodsTable).not.toContain("translate_input_char_limit");
        expect(quotaPeriodsTable).not.toContain("respell_input_char_limit");
        expect(quotaPeriodsTable).not.toContain("translate_period_char_limit");
        expect(quotaPeriodsTable).not.toContain("respell_period_char_limit");
        expect(quotaPeriodsTable).not.toContain("last_charged_at_ms");
    });
});
