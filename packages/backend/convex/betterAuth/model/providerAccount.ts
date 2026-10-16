import { components } from "../../_generated/api";

const SIGN_IN_PROVIDER_IDS = ["google", "apple"] as const;

type QueryRunner = {
    runQuery: (query: any, ...args: any[]) => Promise<unknown>;
};

export async function hasSignInProviderAccount(ctx: QueryRunner, userId: string) {
    for (const providerId of SIGN_IN_PROVIDER_IDS) {
        const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "account",
            where: [
                { field: "userId", value: userId },
                { field: "providerId", value: providerId },
            ],
        });

        if (account) {
            return true;
        }
    }

    return false;
}
