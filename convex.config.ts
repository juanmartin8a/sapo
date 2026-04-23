import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import sapopinguino from "./sapopinguino/convex.config";
import subscriptions from "./subscriptions/convex.config";
import resend from "@convex-dev/resend/convex.config.js";

const app = defineApp();
app.use(betterAuth);
app.use(sapopinguino);
app.use(subscriptions);
app.use(resend);

export default app;
