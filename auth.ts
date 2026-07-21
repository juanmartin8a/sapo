import { query } from "./_generated/server";
import { getCurrentUser as getCurrentUserHandler } from "./model/auth";

export const getCurrentUser = query({
    args: {},
    handler: getCurrentUserHandler,
});
