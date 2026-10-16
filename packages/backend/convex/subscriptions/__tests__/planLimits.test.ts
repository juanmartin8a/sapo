import { describe, expect, it } from "@jest/globals";

import {
    getDefaultPlanLimits,
    resolveOperationLimits,
    resolvePlanLimitsForPlanKey,
} from "../model/planLimits";

describe("subscription plan limits", () => {
    it("allows free users only the translation quota", () => {
        const limits = getDefaultPlanLimits("free");

        expect(resolveOperationLimits("translate", limits)).toEqual({
            input_limit: 500,
            monthly_limit: 5_000,
        });
        expect(resolveOperationLimits("respell", limits)).toEqual({
            input_limit: 0,
            monthly_limit: 0,
        });
    });

    it("uses the paid translation and respelling quotas", () => {
        const limits = getDefaultPlanLimits("polyglot");

        expect(resolveOperationLimits("translate", limits)).toEqual({
            input_limit: 10_000,
            monthly_limit: 500_000,
        });
        expect(resolveOperationLimits("respell", limits)).toEqual({
            input_limit: 2_000,
            monthly_limit: 100_000,
        });
    });

    it("replaces persisted legacy limits with the authoritative policy", async () => {
        const patches: unknown[] = [];
        const activePlan = {
            _id: "plan_limits_1",
            is_active: true,
            updated_at_ms: 1,
            translate_input_char_limit: 1_000,
            respell_input_char_limit: 300,
            translate_monthly_char_limit: 500_000,
            respell_monthly_char_limit: 6_000,
        };
        const ctx = {
            db: {
                query: () => ({
                    withIndex: () => ({
                        collect: async () => [activePlan],
                    }),
                }),
                patch: async (...args: unknown[]) => {
                    patches.push(args);
                },
            },
        } as never;

        await expect(
            resolvePlanLimitsForPlanKey(ctx, {
                plan_key: "polyglot",
                now_ms: 2,
            })
        ).resolves.toEqual(getDefaultPlanLimits("polyglot"));
        expect(patches).toEqual([
            [
                "subscription_plan_limits",
                "plan_limits_1",
                {
                    ...getDefaultPlanLimits("polyglot"),
                    updated_at_ms: 2,
                },
            ],
        ]);
    });
});
