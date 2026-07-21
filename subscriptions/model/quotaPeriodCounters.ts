import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
    INPUT_CHARACTERS_QUOTA_UNIT,
    SUBSCRIPTION_USAGE_OPERATIONS,
} from "../../constants/subscriptions";
import {
    resolveOperationLimits,
    type SubscriptionPlanLimits,
    type SubscriptionUsageOperation,
} from "./planLimits";

export { INPUT_CHARACTERS_QUOTA_UNIT } from "../../constants/subscriptions";

export type SubscriptionQuotaUnit = typeof INPUT_CHARACTERS_QUOTA_UNIT;
export type QuotaPeriodUsageSnapshot = {
    translateCharsUsed: number;
    respellCharsUsed: number;
};
export type QuotaPeriodCounterUsageSummary = {
    chargedUnits: number;
    lastChargedAtMs: number;
};
export type QuotaPeriodCounterInsertDocument = {
    quota_period_id: Id<"quota_periods">;
    operation: SubscriptionUsageOperation;
    quota_unit: SubscriptionQuotaUnit;
    charged_units: number;
    input_limit: number;
    period_limit: number;
    last_charged_at_ms?: number;
    created_at_ms: number;
    updated_at_ms: number;
};
export type QuotaPeriodCounterChargePatch = {
    charged_units: number;
    last_charged_at_ms: number;
    updated_at_ms: number;
};

type DbReaderCtx = Pick<MutationCtx, "db"> | Pick<QueryCtx, "db">;
type MutableQuotaPeriodCounterFields = Partial<
    Omit<Doc<"quota_period_counters">, "_id" | "_creationTime">
>;

function sanitizeCounterUnits(units: number) {
    return Math.max(0, Math.floor(units));
}

export function createZeroQuotaPeriodUsageSnapshot(): QuotaPeriodUsageSnapshot {
    return {
        translateCharsUsed: 0,
        respellCharsUsed: 0,
    };
}

export function addQuotaPeriodUsageSnapshotUnits(
    usageSnapshot: QuotaPeriodUsageSnapshot,
    operation: SubscriptionUsageOperation,
    units: number
) {
    if (operation === SUBSCRIPTION_USAGE_OPERATIONS.TRANSLATE) {
        usageSnapshot.translateCharsUsed += units;
        return;
    }

    usageSnapshot.respellCharsUsed += units;
}

export function resolveQuotaPeriodCounterLimits(
    operation: SubscriptionUsageOperation,
    planLimits: SubscriptionPlanLimits
) {
    const operationLimits = resolveOperationLimits(operation, planLimits);

    return {
        input_limit: operationLimits.input_limit,
        period_limit: operationLimits.monthly_limit,
    };
}

export function buildQuotaPeriodCounterInsertDocument(args: {
    quota_period_id: Id<"quota_periods">;
    operation: SubscriptionUsageOperation;
    quota_unit?: SubscriptionQuotaUnit;
    input_limit: number;
    period_limit: number;
    charged_units?: number;
    last_charged_at_ms?: number;
    now_ms: number;
}): QuotaPeriodCounterInsertDocument {
    return {
        quota_period_id: args.quota_period_id,
        operation: args.operation,
        quota_unit: args.quota_unit ?? INPUT_CHARACTERS_QUOTA_UNIT,
        charged_units: sanitizeCounterUnits(args.charged_units ?? 0),
        input_limit: Math.max(0, Math.floor(args.input_limit)),
        period_limit: Math.max(0, Math.floor(args.period_limit)),
        ...(typeof args.last_charged_at_ms === "number"
            ? { last_charged_at_ms: args.last_charged_at_ms }
            : {}),
        created_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    };
}

export function buildQuotaPeriodCounterChargePatch(args: {
    counter: Pick<Doc<"quota_period_counters">, "charged_units">;
    charged_units: number;
    now_ms: number;
}): QuotaPeriodCounterChargePatch {
    return {
        charged_units: args.counter.charged_units + sanitizeCounterUnits(args.charged_units),
        last_charged_at_ms: args.now_ms,
        updated_at_ms: args.now_ms,
    };
}

export function resolveQuotaCounterReservationSnapshot(args: {
    counter: Pick<
        Doc<"quota_period_counters">,
        "charged_units" | "input_limit" | "period_limit"
    >;
    outstanding_units: number;
}) {
    return {
        charged_units: sanitizeCounterUnits(args.counter.charged_units),
        input_limit: Math.max(0, Math.floor(args.counter.input_limit)),
        period_limit: Math.max(0, Math.floor(args.counter.period_limit)),
        used_chars:
            sanitizeCounterUnits(args.counter.charged_units) +
            sanitizeCounterUnits(args.outstanding_units),
    };
}

export function shouldRejectQuotaInputBeforeCounterCreation(args: {
    input_char_count: number;
    input_limit: number;
}) {
    return sanitizeCounterUnits(args.input_char_count) > Math.max(0, Math.floor(args.input_limit));
}

export async function listQuotaPeriodCountersByQuotaPeriodId(
    ctx: DbReaderCtx,
    quotaPeriodId: Id<"quota_periods">
) {
    return ctx.db
        .query("quota_period_counters")
        .withIndex("by_quota_period_id", (query) => query.eq("quota_period_id", quotaPeriodId))
        .collect();
}

export async function getQuotaPeriodCounterRowsByOperationUnit(
    ctx: DbReaderCtx,
    args: {
        quota_period_id: Id<"quota_periods">;
        operation: SubscriptionUsageOperation;
        quota_unit?: SubscriptionQuotaUnit;
    }
) {
    return ctx.db
        .query("quota_period_counters")
        .withIndex("by_quota_period_id_operation_unit", (query) =>
            query
                .eq("quota_period_id", args.quota_period_id)
                .eq("operation", args.operation)
                .eq("quota_unit", args.quota_unit ?? INPUT_CHARACTERS_QUOTA_UNIT)
        )
        .collect();
}

function sortCounterRowsByCreationTime(counters: Doc<"quota_period_counters">[]) {
    return [...counters].sort((left, right) => {
        if (left.created_at_ms !== right.created_at_ms) {
            return left.created_at_ms - right.created_at_ms;
        }

        return left._creationTime - right._creationTime;
    });
}

async function normalizeQuotaPeriodCounterRows(
    ctx: Pick<MutationCtx, "db">,
    counters: Doc<"quota_period_counters">[],
    args: {
        input_limit?: number;
        period_limit?: number;
        now_ms: number;
    }
) {
    const sortedCounters = sortCounterRowsByCreationTime(counters);
    const canonicalCounter = sortedCounters[0] ?? null;

    if (!canonicalCounter) {
        return null;
    }

    const duplicateCounters = sortedCounters.slice(1);
    const patch: MutableQuotaPeriodCounterFields = {};

    if (duplicateCounters.length > 0) {
        const mergedChargedUnits = sortedCounters.reduce(
            (sum, counter) => sum + sanitizeCounterUnits(counter.charged_units),
            0
        );
        const mergedLastChargedAtMs = sortedCounters.reduce<number | undefined>(
            (latest, counter) => {
                if (typeof counter.last_charged_at_ms !== "number") {
                    return latest;
                }

                return typeof latest === "number"
                    ? Math.max(latest, counter.last_charged_at_ms)
                    : counter.last_charged_at_ms;
            },
            undefined
        );

        patch.charged_units = mergedChargedUnits;
        patch.last_charged_at_ms = mergedLastChargedAtMs;
    }

    if (typeof args.input_limit === "number") {
        const inputLimit = Math.max(0, Math.floor(args.input_limit));

        if (canonicalCounter.input_limit !== inputLimit) {
            patch.input_limit = inputLimit;
        }
    }

    if (typeof args.period_limit === "number") {
        const periodLimit = Math.max(0, Math.floor(args.period_limit));

        if (canonicalCounter.period_limit !== periodLimit) {
            patch.period_limit = periodLimit;
        }
    }

    if (Object.keys(patch).length > 0) {
        patch.updated_at_ms = args.now_ms;
        await ctx.db.patch(canonicalCounter._id, patch);
    }

    for (const duplicateCounter of duplicateCounters) {
        await ctx.db.delete(duplicateCounter._id);
    }

    return {
        ...canonicalCounter,
        ...patch,
    };
}

export async function getQuotaPeriodCounterByOperationUnit(
    ctx: DbReaderCtx,
    args: {
        quota_period_id: Id<"quota_periods">;
        operation: SubscriptionUsageOperation;
        quota_unit?: SubscriptionQuotaUnit;
    }
) {
    const counters = await getQuotaPeriodCounterRowsByOperationUnit(ctx, args);

    return sortCounterRowsByCreationTime(counters)[0] ?? null;
}

export async function getOrCreateQuotaPeriodCounter(
    ctx: Pick<MutationCtx, "db">,
    args: {
        quota_period_id: Id<"quota_periods">;
        operation: SubscriptionUsageOperation;
        quota_unit?: SubscriptionQuotaUnit;
        input_limit: number;
        period_limit: number;
        now_ms: number;
    }
) {
    const existingCounters = await getQuotaPeriodCounterRowsByOperationUnit(ctx, args);
    const normalizedCounter = await normalizeQuotaPeriodCounterRows(ctx, existingCounters, {
        input_limit: args.input_limit,
        period_limit: args.period_limit,
        now_ms: args.now_ms,
    });

    if (normalizedCounter) {
        return normalizedCounter;
    }

    const counterId = await ctx.db.insert(
        "quota_period_counters",
        buildQuotaPeriodCounterInsertDocument(args)
    );
    const insertedCounter = await ctx.db.get(counterId);

    if (!insertedCounter) {
        throw new Error("Failed to create quota period counter");
    }

    return insertedCounter;
}

export async function syncExistingQuotaPeriodCountersForPlanLimits(
    ctx: Pick<MutationCtx, "db">,
    args: {
        quota_period_id: Id<"quota_periods">;
        planLimits: SubscriptionPlanLimits;
        now_ms: number;
    }
) {
    const counters = await listQuotaPeriodCountersByQuotaPeriodId(ctx, args.quota_period_id);

    for (const counter of counters) {
        const limits = resolveQuotaPeriodCounterLimits(counter.operation, args.planLimits);
        const patch: MutableQuotaPeriodCounterFields = {};

        if (counter.input_limit !== limits.input_limit) {
            patch.input_limit = limits.input_limit;
        }
        if (counter.period_limit !== limits.period_limit) {
            patch.period_limit = limits.period_limit;
        }

        if (Object.keys(patch).length === 0) {
            continue;
        }

        patch.updated_at_ms = args.now_ms;
        await ctx.db.patch(counter._id, patch);
    }
}

export async function applyQuotaPeriodCounterCharge(
    ctx: Pick<MutationCtx, "db">,
    args: {
        counter: Doc<"quota_period_counters">;
        charged_units: number;
        now_ms: number;
    }
) {
    const patch = buildQuotaPeriodCounterChargePatch(args);

    await ctx.db.patch(args.counter._id, patch);

    return {
        ...args.counter,
        ...patch,
    };
}

export async function resolveQuotaPeriodUsageSnapshotFromCounters(
    ctx: DbReaderCtx,
    quotaPeriodId: Id<"quota_periods">
) {
    const counters = await listQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriodId);
    const usageSnapshot = createZeroQuotaPeriodUsageSnapshot();

    for (const counter of counters) {
        addQuotaPeriodUsageSnapshotUnits(
            usageSnapshot,
            counter.operation,
            sanitizeCounterUnits(counter.charged_units)
        );
    }

    return usageSnapshot;
}

export async function resolveQuotaPeriodCounterUsageSummary(
    ctx: DbReaderCtx,
    quotaPeriodId: Id<"quota_periods">
): Promise<QuotaPeriodCounterUsageSummary> {
    const counters = await listQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriodId);

    return counters.reduce<QuotaPeriodCounterUsageSummary>(
        (summary, counter) => ({
            chargedUnits: summary.chargedUnits + sanitizeCounterUnits(counter.charged_units),
            lastChargedAtMs:
                typeof counter.last_charged_at_ms === "number"
                    ? Math.max(summary.lastChargedAtMs, counter.last_charged_at_ms)
                    : summary.lastChargedAtMs,
        }),
        { chargedUnits: 0, lastChargedAtMs: 0 }
    );
}

export async function copyQuotaPeriodCountersToQuotaPeriod(
    ctx: Pick<MutationCtx, "db">,
    args: {
        source_quota_period_id: Id<"quota_periods">;
        target_quota_period_id: Id<"quota_periods">;
        planLimits: SubscriptionPlanLimits;
        now_ms: number;
    }
) {
    const sourceCounters = await listQuotaPeriodCountersByQuotaPeriodId(
        ctx,
        args.source_quota_period_id
    );

    for (const sourceCounter of sourceCounters) {
        const limits = resolveQuotaPeriodCounterLimits(sourceCounter.operation, args.planLimits);
        const targetCounter = await getOrCreateQuotaPeriodCounter(ctx, {
            quota_period_id: args.target_quota_period_id,
            operation: sourceCounter.operation,
            quota_unit: sourceCounter.quota_unit,
            input_limit: limits.input_limit,
            period_limit: limits.period_limit,
            now_ms: args.now_ms,
        });
        const patch: MutableQuotaPeriodCounterFields = {
            charged_units: sanitizeCounterUnits(sourceCounter.charged_units),
            last_charged_at_ms: sourceCounter.last_charged_at_ms,
            input_limit: limits.input_limit,
            period_limit: limits.period_limit,
            updated_at_ms: args.now_ms,
        };

        await ctx.db.patch(targetCounter._id, patch);
    }
}

export async function mergeQuotaPeriodCountersIntoTarget(
    ctx: Pick<MutationCtx, "db">,
    args: {
        source_quota_period_id: Id<"quota_periods">;
        target_quota_period_id: Id<"quota_periods">;
        now_ms: number;
    }
) {
    const sourceCounters = await listQuotaPeriodCountersByQuotaPeriodId(
        ctx,
        args.source_quota_period_id
    );

    for (const sourceCounter of sourceCounters) {
        const existingTargetCounters = await getQuotaPeriodCounterRowsByOperationUnit(ctx, {
            quota_period_id: args.target_quota_period_id,
            operation: sourceCounter.operation,
            quota_unit: sourceCounter.quota_unit,
        });
        const targetCounter = await normalizeQuotaPeriodCounterRows(ctx, existingTargetCounters, {
            now_ms: args.now_ms,
        });

        if (!targetCounter) {
            await ctx.db.insert("quota_period_counters", {
                quota_period_id: args.target_quota_period_id,
                operation: sourceCounter.operation,
                quota_unit: sourceCounter.quota_unit,
                charged_units: sanitizeCounterUnits(sourceCounter.charged_units),
                input_limit: sourceCounter.input_limit,
                period_limit: sourceCounter.period_limit,
                ...(typeof sourceCounter.last_charged_at_ms === "number"
                    ? { last_charged_at_ms: sourceCounter.last_charged_at_ms }
                    : {}),
                created_at_ms: args.now_ms,
                updated_at_ms: args.now_ms,
            });
            continue;
        }

        const nextLastChargedAtMs =
            typeof sourceCounter.last_charged_at_ms === "number"
                ? typeof targetCounter.last_charged_at_ms === "number"
                    ? Math.max(targetCounter.last_charged_at_ms, sourceCounter.last_charged_at_ms)
                    : sourceCounter.last_charged_at_ms
                : targetCounter.last_charged_at_ms;

        await ctx.db.patch(targetCounter._id, {
            charged_units:
                sanitizeCounterUnits(targetCounter.charged_units) +
                sanitizeCounterUnits(sourceCounter.charged_units),
            last_charged_at_ms: nextLastChargedAtMs,
            updated_at_ms: args.now_ms,
        });
    }
}

export async function deleteQuotaPeriodCountersByQuotaPeriodId(
    ctx: Pick<MutationCtx, "db">,
    quotaPeriodId: Id<"quota_periods">
) {
    const counters = await listQuotaPeriodCountersByQuotaPeriodId(ctx, quotaPeriodId);

    for (const counter of counters) {
        await ctx.db.delete(counter._id);
    }

    return counters.length;
}
