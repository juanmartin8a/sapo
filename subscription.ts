import { query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentSubscriptionStatus as getCurrentSubscriptionStatusHandler } from "./model/subscription";

export const getCurrentSubscriptionStatus = query({
    args: { expected_user_id: v.string() },
    handler: getCurrentSubscriptionStatusHandler,
});
