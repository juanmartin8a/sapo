import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { HTTP_ROUTES } from "./constants/http";
import { handleResendWebhook } from "./model/email";
import {
    subscriptionReconciliation,
    subscriptionReconciliationOptions,
} from "./subscriptionReconciliation";
import {
    sapopinguino,
    sapopinguinoOptions,
} from "./sapopinguinoHttp";
import { sapopinguinoTranslate, sapopinguinoTranslateOptions } from "./sapopinguinoTranslate";
import {
    revenueCatWebhook,
    revenueCatWebhookOptions,
} from "./subscriptionsWebhook";

const http = httpRouter();

authComponent.registerRoutesLazy(http, createAuth, { cors: true });

http.route({
    path: HTTP_ROUTES.RESEND_WEBHOOK,
    method: "POST",
    handler: httpAction(handleResendWebhook),
});

http.route({
    path: HTTP_ROUTES.SAPOPINGUINO_RESPELL,
    method: "POST",
    handler: sapopinguino,
});

http.route({
    path: HTTP_ROUTES.SAPOPINGUINO_RESPELL,
    method: "OPTIONS",
    handler: sapopinguinoOptions,
});

http.route({
    path: HTTP_ROUTES.SAPOPINGUINO_TRANSLATE,
    method: "POST",
    handler: sapopinguinoTranslate,
});

http.route({
    path: HTTP_ROUTES.SAPOPINGUINO_TRANSLATE,
    method: "OPTIONS",
    handler: sapopinguinoTranslateOptions,
});

http.route({
    path: HTTP_ROUTES.SUBSCRIPTION_RECONCILIATION,
    method: "POST",
    handler: subscriptionReconciliation,
});

http.route({
    path: HTTP_ROUTES.SUBSCRIPTION_RECONCILIATION,
    method: "OPTIONS",
    handler: subscriptionReconciliationOptions,
});

http.route({
    path: HTTP_ROUTES.REVENUECAT_WEBHOOK,
    method: "POST",
    handler: revenueCatWebhook,
});

http.route({
    path: HTTP_ROUTES.REVENUECAT_WEBHOOK,
    method: "OPTIONS",
    handler: revenueCatWebhookOptions,
});

export default http;
