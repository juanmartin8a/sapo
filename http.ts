import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { refresh, refreshOptions } from "./refresh";
import {
    sapopinguino,
    sapopinguinoOptions,
    sapopinguinoStop,
    sapopinguinoStopOptions,
} from "./sapopinguinoHttp";
import { sapopinguinoTranslate, sapopinguinoTranslateOptions } from "./sapopinguinoTranslate";
import {
    revenueCatWebhook,
    revenueCatWebhookOptions,
} from "./subscriptionsWebhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
    path: "/sapopinguino",
    method: "POST",
    handler: sapopinguino,
});

http.route({
    path: "/sapopinguino",
    method: "OPTIONS",
    handler: sapopinguinoOptions,
});

http.route({
    path: "/sapopinguino-stop",
    method: "POST",
    handler: sapopinguinoStop,
});

http.route({
    path: "/sapopinguino-stop",
    method: "OPTIONS",
    handler: sapopinguinoStopOptions,
});

http.route({
    path: "/sapopinguino-translate",
    method: "POST",
    handler: sapopinguinoTranslate,
});

http.route({
    path: "/sapopinguino-translate",
    method: "OPTIONS",
    handler: sapopinguinoTranslateOptions,
});

http.route({
    path: "/refresh",
    method: "GET",
    handler: refresh,
});

http.route({
    path: "/refresh",
    method: "POST",
    handler: refresh,
});

http.route({
    path: "/refresh",
    method: "OPTIONS",
    handler: refreshOptions,
});

http.route({
    path: "/webhooks/revenuecat",
    method: "POST",
    handler: revenueCatWebhook,
});

http.route({
    path: "/webhooks/revenuecat",
    method: "OPTIONS",
    handler: revenueCatWebhookOptions,
});

export default http;
