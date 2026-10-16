import { internalAction, query } from "./_generated/server";
import {
    getCurrentUser as getCurrentUserHandler,
    provisionDemoUser as provisionDemoUserHandler,
} from "./model/auth";

export const getCurrentUser = query({
    args: {},
    handler: getCurrentUserHandler,
});

// Operator-only setup: no public sign-up or password endpoint is enabled.
export const provisionDemoUser = internalAction({
    args: {},
    handler: provisionDemoUserHandler,
});
